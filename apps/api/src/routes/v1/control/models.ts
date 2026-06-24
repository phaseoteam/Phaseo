// Purpose: Gateway models catalogue route.
// Why: Expose rich model metadata with compatibility fields.
// How: Loads catalogue rows, enriches each model, and returns paged results.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { guardAuth, type GuardErr } from "@pipeline/before/guards";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { fetchGatewayContext } from "@pipeline/before/context";
import { json, withRuntime, cacheHeaders } from "@/routes/utils";
import { requireCapability } from "./route-helpers";
import {
    fetchCatalogue,
    type CatalogueModel,
    type PricingMeterSummary,
    type PricingSummary,
    type SupportedParamDetail,
    type SupportedParamDetails,
} from "./models.catalogue";
import { buildFeedResponse, parseFeedFormat, type FeedItem } from "./models.feeds";

type LifecycleStatus = "active" | "deprecated" | "retired" | null;
type AvailabilityMode = "active" | "all";

type CompatibilityPricing = {
    prompt: string | null;
    completion: string | null;
    request: string | null;
    image: string | null;
    input_cache_read: string | null;
    input_cache_write: string | null;
    web_search: string | null;
};

type CompatibilityArchitecture = {
    modality: string;
    input_modalities: string[];
    output_modalities: string[];
    tokenizer: string | null;
    instruct_type: string | null;
};

type CompatibilityTopProvider = {
    context_length: number | null;
    max_completion_tokens: number | null;
    is_moderated: boolean;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 250;
const MAX_OFFSET = 5000;
const FREE_ROUTER_MODEL_ID = "phaseo/free";
const FREE_ROUTER_NAME = "Phaseo Free Router";
const FREE_ROUTER_ENDPOINTS = ["chat/completions", "responses", "interactions", "messages"] as const;

function parsePaginationParam(raw: string | null, fallback: number, max: number): number {
    if (!raw) return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    const normalized = Math.floor(parsed);
    if (normalized <= 0) return fallback;
    if (normalized > max) return max;
    return normalized;
}

function parseOffsetParam(raw: string | null): number {
    if (!raw) return 0;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
}

function toStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value
            .map((item) => (typeof item === "string" ? item.trim() : String(item)))
            .filter((item) => item.length > 0);
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return [];
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            const inner = trimmed.slice(1, -1);
            if (!inner) return [];
            return inner
                .split(",")
                .map((part) => part.trim().replace(/^"|"$/g, ""))
                .filter((part) => part.length > 0);
        }
        return trimmed
            .split(/[,\s]+/)
            .map((part) => part.trim())
            .filter((part) => part.length > 0);
    }
    return [];
}

function parseMultiValue(params: URLSearchParams, name: string): string[] {
    const values = params.getAll(name);
    if (!values.length) return [];
    return values.flatMap((value) => toStringArray(value));
}

function parseAvailabilityMode(raw: string | null): AvailabilityMode | null {
    if (!raw) return "active";
    const normalized = raw.trim().toLowerCase();
    if (normalized === "active" || normalized === "all") {
        return normalized;
    }
    return null;
}

function hasDeprecatedPrivacyScopeQuery(url: URL): boolean {
    return url.searchParams.has("privacy_scope") || url.searchParams.has("privacy");
}

function normalizeLifecycleStatus(
    status: string | null | undefined,
    deprecationDate: string | null | undefined,
    retirementDate: string | null | undefined
): LifecycleStatus {
    const now = Date.now();
    const retirement = toUnixSeconds(retirementDate);
    if (retirement !== null && retirement * 1000 <= now) return "retired";

    const normalized = (status ?? "").trim().toLowerCase();
    if (normalized === "retired") return "retired";

    const deprecation = toUnixSeconds(deprecationDate);
    if (deprecation !== null && deprecation * 1000 <= now) return "deprecated";
    if (normalized === "deprecated") return "deprecated";

    if (!normalized) return null;
    return "active";
}

function buildLifecycleMessage(
    lifecycleStatus: LifecycleStatus,
    deprecationDate: string | null,
    retirementDate: string | null,
    replacementModelId: string | null
): string | null {
    const replacement = replacementModelId ? ` Use "${replacementModelId}" instead.` : "";
    if (lifecycleStatus === "retired") {
        return retirementDate
            ? `Model retired on ${retirementDate}.${replacement}`
            : `Model is retired.${replacement}`;
    }
    if (lifecycleStatus === "deprecated") {
        return retirementDate
            ? `Model is deprecated and scheduled for retirement on ${retirementDate}.${replacement}`
            : deprecationDate
                ? `Model is deprecated since ${deprecationDate}.${replacement}`
                : `Model is deprecated.${replacement}`;
    }
    return null;
}

function buildReplacementByPreviousModel(catalogue: CatalogueModel[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const model of catalogue) {
        const previousModelId = String(model.previous_model_id ?? "").trim();
        const replacementModelId = String(model.model_id ?? "").trim();
        if (!previousModelId || !replacementModelId || map.has(previousModelId)) continue;
        map.set(previousModelId, replacementModelId);
    }
    return map;
}

function toUnixSeconds(value: string | null): number | null {
    if (!value) return null;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.floor(parsed / 1000);
}

function meterToUnitPrice(meter: PricingMeterSummary | null | undefined): string | null {
    if (!meter) return null;
    const rawPrice = Number(meter.price_per_unit);
    if (!Number.isFinite(rawPrice)) return null;
    const unitSize = Number.isFinite(meter.unit_size) && meter.unit_size > 0 ? meter.unit_size : 1;
    return String(rawPrice / unitSize);
}

function inferInstructType(endpoints: string[]): string | null {
    if (endpoints.some((endpoint) => endpoint === "chat/completions" || endpoint === "messages" || endpoint === "responses" || endpoint === "interactions")) {
        return "chat";
    }
    if (endpoints.includes("embeddings")) return "embedding";
    if (endpoints.includes("moderations")) return "moderation";
    if (endpoints.some((endpoint) => endpoint.startsWith("images/"))) return "image";
    if (endpoints.some((endpoint) => endpoint.startsWith("audio/"))) return "audio";
    if (endpoints.some((endpoint) => endpoint.startsWith("video") || endpoint.startsWith("videos"))) return "video";
    return null;
}

function inferModality(inputTypes: string[], outputTypes: string[]): string {
    const normalizedInput = Array.from(
        new Set(inputTypes.map((value) => value.trim().toLowerCase()).filter((value) => value.length > 0))
    ).sort();
    const normalizedOutput = Array.from(
        new Set(outputTypes.map((value) => value.trim().toLowerCase()).filter((value) => value.length > 0))
    ).sort();
    const input = normalizedInput.length ? normalizedInput.join("+") : "unknown";
    const output = normalizedOutput.length ? normalizedOutput.join("+") : "unknown";
    return `${input}->${output}`;
}

function toCompatibilityPricing(pricing: PricingSummary): CompatibilityPricing {
    const meters = pricing.meters;
    return {
        prompt: meterToUnitPrice(meters.input_tokens ?? meters.input_text_tokens),
        completion: meterToUnitPrice(meters.output_tokens ?? meters.output_text_tokens),
        request: null,
        image: meterToUnitPrice(
            meters.output_image ?? meters.input_image ?? meters.input_image_tokens ?? meters.output_image_tokens
        ),
        input_cache_read: meterToUnitPrice(
            meters.implicit_cached_input_text_tokens ?? meters.cached_read_text_tokens
        ),
        input_cache_write: meterToUnitPrice(
            meters.cached_write_text_tokens ??
                meters.cached_write_text_tokens_5m ??
                meters.cached_write_text_tokens_1h
        ),
        web_search: meterToUnitPrice(meters.web_search),
    };
}

function toCompatibilityArchitecture(model: CatalogueModel): CompatibilityArchitecture {
    return {
        modality: inferModality(model.input_types, model.output_types),
        input_modalities: [...model.input_types],
        output_modalities: [...model.output_types],
        tokenizer: null,
        instruct_type: inferInstructType(model.endpoints),
    };
}

function toCompatibilityTopProvider(model: CatalogueModel): CompatibilityTopProvider {
    return {
        context_length: null,
        max_completion_tokens: null,
        is_moderated: model.endpoints.includes("moderations"),
    };
}

function buildDescription(model: CatalogueModel): string {
    if (model.model_id === FREE_ROUTER_MODEL_ID) {
        return "Routes each request to an eligible free model pool with provider-aware balancing.";
    }
    const explicitDescription = typeof model.description === "string" ? model.description.trim() : "";
    if (explicitDescription) {
        return explicitDescription;
    }
    const displayName = model.name?.trim() || model.model_id;
    if (!model.endpoints.length) {
        return `${displayName} via Phaseo Gateway.`;
    }
    return `${displayName} via Phaseo Gateway. Supports ${model.endpoints.join(", ")}.`;
}

function canIncludeFreeRouter(endpoints: string[]): boolean {
    if (!endpoints.length) return true;
    const allowed = new Set(FREE_ROUTER_ENDPOINTS.map((endpoint) => endpoint.toLowerCase()));
    return endpoints.some((endpoint) => allowed.has(endpoint.trim().toLowerCase()));
}

function buildFreeRouterPricingMeters(args: {
    pricing: Record<string, any>;
    providers: Array<{ providerId: string; pricingKey: string }>;
}): PricingSummary["meters"] {
    const meters: PricingSummary["meters"] = {};
    for (const provider of args.providers) {
        const pricingCard = args.pricing?.[provider.pricingKey];
        const rules = Array.isArray(pricingCard?.rules) ? pricingCard.rules : [];
        for (const rule of rules) {
            const meter = typeof rule?.meter === "string" ? rule.meter.trim() : "";
            if (!meter || meter in meters) continue;
            const unitSize = Number(rule?.unit_size);
            meters[meter] = {
                provider_id: provider.providerId,
                unit: typeof rule?.unit === "string" ? rule.unit : "token",
                unit_size: Number.isFinite(unitSize) && unitSize > 0 ? unitSize : 1,
                price_per_unit: String(rule?.price_per_unit ?? "0"),
                currency: typeof rule?.currency === "string" ? rule.currency : null,
            };
        }
    }
    return meters;
}

function cloneJsonObject<T>(value: T): T {
    return JSON.parse(JSON.stringify(value ?? {}));
}

function toRichModelProvider(provider: CatalogueModel["providers"][number]) {
    return {
        ...provider,
        supported_parameters: [...provider.params],
        supported_parameters_detail: cloneJsonObject(provider.params_detail ?? {}),
    };
}

function mergeParamDetail(a: SupportedParamDetail, b: SupportedParamDetail): SupportedParamDetail {
    const merged: SupportedParamDetail = { ...a, ...b };
    const values = [
        ...(Array.isArray(a.values) ? a.values : []),
        ...(Array.isArray(b.values) ? b.values : []),
    ];
    if (values.length > 0) {
        merged.values = Array.from(new Set(values.map((value) => JSON.stringify(value))))
            .map((value) => JSON.parse(value))
            .sort((left, right) => String(left).localeCompare(String(right)));
    }
    const providers = [
        ...(Array.isArray(a.providers) ? a.providers : []),
        ...(Array.isArray(b.providers) ? b.providers : []),
    ].filter((provider): provider is string => typeof provider === "string" && provider.length > 0);
    if (providers.length > 0) {
        merged.providers = Array.from(new Set(providers)).sort((left, right) => left.localeCompare(right));
    }
    return merged;
}

function mergeParamDetails(...items: Array<SupportedParamDetails | undefined | null>): SupportedParamDetails {
    const out: SupportedParamDetails = {};
    for (const item of items) {
        if (!item) continue;
        for (const [name, detail] of Object.entries(item)) {
            out[name] = out[name] ? mergeParamDetail(out[name], detail) : { ...detail };
        }
    }
    return out;
}

function detailsForParamNames(params: string[], providerId: string): SupportedParamDetails {
    return Object.fromEntries(
        params.map((param) => [
            param,
            {
                supported: true,
                providers: [providerId],
            },
        ])
    );
}

async function buildFreeRouterCatalogueModel(args: {
    workspaceId: string;
    apiKeyId: string;
    endpoints: string[];
    catalogue: CatalogueModel[];
}): Promise<CatalogueModel | null> {
    if (!canIncludeFreeRouter(args.endpoints)) return null;

    try {
        const freeContext = await fetchGatewayContext({
            workspaceId: args.workspaceId,
            apiKeyId: args.apiKeyId,
            model: FREE_ROUTER_MODEL_ID,
            endpoint: "text.generate",
        });
        if (!Array.isArray(freeContext.providers) || freeContext.providers.length === 0) {
            return null;
        }

        const matchedConcreteModels: CatalogueModel[] = [];
        const providers: CatalogueModel["providers"] = [];
        const providerKeySet = new Set<string>();
        for (const snapshot of freeContext.providers) {
            const providerId = String(snapshot.providerId ?? "").trim();
            const apiModelId = String(snapshot.apiModelId ?? "").trim();
            if (!providerId || !apiModelId || providerKeySet.has(providerId)) continue;

            const concreteModel = args.catalogue.find((model) => model.model_id === apiModelId);
            if (!concreteModel) continue;

            const concreteProvider = concreteModel.providers.find((provider) => provider.api_provider_id === providerId);
            if (!concreteProvider) continue;

            providerKeySet.add(providerId);
            matchedConcreteModels.push(concreteModel);
            providers.push({
                ...concreteProvider,
                params: Array.from(
                    new Set([
                        ...concreteProvider.params,
                        ...Object.keys(snapshot.capabilityParams ?? {}),
                    ])
                ).sort(),
                params_detail: mergeParamDetails(
                    concreteProvider.params_detail,
                    detailsForParamNames(Object.keys(snapshot.capabilityParams ?? {}), providerId)
                ),
            });
        }

        if (!providers.length || !matchedConcreteModels.length) {
            return null;
        }

        const endpoints = Array.from(
            new Set(
                matchedConcreteModels
                    .flatMap((model) => model.endpoints)
                    .filter((endpoint) => FREE_ROUTER_ENDPOINTS.includes(endpoint as (typeof FREE_ROUTER_ENDPOINTS)[number]))
            )
        );
        const inputTypes = Array.from(new Set(matchedConcreteModels.flatMap((model) => model.input_types))).sort();
        const outputTypes = Array.from(new Set(matchedConcreteModels.flatMap((model) => model.output_types))).sort();
        const supportedParams = Array.from(
            new Set([
                ...matchedConcreteModels.flatMap((model) => model.supported_params),
                ...providers.flatMap((provider) => provider.params),
            ])
        ).sort();
        const supportedParamsDetail = mergeParamDetails(
            ...matchedConcreteModels.map((model) => model.supported_params_detail),
            ...providers.map((provider) => provider.params_detail)
        );

        return {
            model_id: FREE_ROUTER_MODEL_ID,
            previous_model_id: null,
            name: FREE_ROUTER_NAME,
            description: null,
            release_date: null,
            deprecation_date: null,
            retirement_date: null,
            status: "active",
            organisation_id: "phaseo",
            organisation_name: "Phaseo",
            organisation_colour: null,
            aliases: [],
            endpoints,
            input_types: inputTypes,
            output_types: outputTypes,
            providers,
            supported_params: supportedParams,
            supported_params_detail: supportedParamsDetail,
            top_provider: providers[0]?.api_provider_id ?? null,
            pricing: {
                pricing_plan: "standard",
                meters: buildFreeRouterPricingMeters({
                    pricing: freeContext.pricing ?? {},
                    providers: freeContext.providers.map((provider) => ({
                        providerId: provider.providerId,
                        pricingKey: provider.pricingKey,
                    })),
                }),
            },
            availability: {
                status: "active",
                provider_count: providers.length,
                active_provider_count: providers.length,
                inactive_provider_count: 0,
            },
        };
    } catch {
        return null;
    }
}

function toRichModel(model: CatalogueModel, replacementModelId: string | null) {
    const {
        previous_model_id: _previousModelId,
        supported_params_detail: _supportedParamsDetail,
        ...publicModel
    } = model;
    const legacyTopProvider = model.top_provider;
    const legacyPricing = model.pricing;
    const lifecycleStatus = normalizeLifecycleStatus(model.status, model.deprecation_date, model.retirement_date);
    return {
        ...publicModel,
        id: model.model_id,
        canonical_slug: model.model_id,
        created: toUnixSeconds(model.release_date),
        description: buildDescription(model),
        architecture: toCompatibilityArchitecture(model),
        providers: model.providers.map(toRichModelProvider),
        top_provider_id: legacyTopProvider,
        top_provider: toCompatibilityTopProvider(model),
        lifecycle: {
            status: lifecycleStatus,
            deprecation_date: model.deprecation_date,
            retirement_date: model.retirement_date,
            replacement_model_id: replacementModelId,
            message: buildLifecycleMessage(
                lifecycleStatus,
                model.deprecation_date,
                model.retirement_date,
                replacementModelId
            ),
        },
        supported_parameters: [...model.supported_params],
        supported_params_detail: cloneJsonObject(model.supported_params_detail ?? {}),
        supported_parameters_detail: cloneJsonObject(model.supported_params_detail ?? {}),
        pricing_detail: legacyPricing,
        pricing: toCompatibilityPricing(legacyPricing),
        per_request_limits: null,
    };
}

export async function handleModels(req: Request) {
    const url = new URL(req.url);
    if (hasDeprecatedPrivacyScopeQuery(url)) {
        return json(
            {
                ok: false,
                error: "invalid_request",
                message: "privacy_scope query is no longer supported. Use /models.",
            },
            400,
            { "Cache-Control": "no-store" }
        );
    }
    const limit = parsePaginationParam(url.searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
    const offset = parseOffsetParam(url.searchParams.get("offset"));
    if (offset > MAX_OFFSET) {
        return json(
            {
                ok: false,
                error: "invalid_request",
                message: `offset must be <= ${MAX_OFFSET}`,
                max_offset: MAX_OFFSET,
            },
            400,
            { "Cache-Control": "no-store" }
        );
    }

    const auth = await guardAuth(req);
    if (!auth.ok) {
        return (auth as GuardErr).response;
    }
    const scopeError = requireCapability(auth.value, CAPABILITIES.MODELS_READ);
    if (scopeError) return scopeError;

    const requestedFormat = parseFeedFormat(url);
    if (requestedFormat.ok === false) {
        return json(
            {
                ok: false,
                error: "invalid_request",
                message: "format must be one of: json, rss, atom",
                provided: requestedFormat.raw,
            },
            400,
            { "Cache-Control": "no-store" }
        );
    }

    const cacheScope = "models:shared:v1";

    const cacheOptions = {
        scope: cacheScope,
        ttlSeconds: 1800,
        staleSeconds: 1800,
        varyHeaders: [],
    };

    const endpoints = parseMultiValue(url.searchParams, "endpoints");
    const statuses = parseMultiValue(url.searchParams, "status");
    const providerIds = parseMultiValue(url.searchParams, "provider");
    const providerStatuses = parseMultiValue(url.searchParams, "provider_status");
    const providerRoutingStatuses = parseMultiValue(
        url.searchParams,
        "provider_routing_status"
    );
    const modelRoutingStatuses = parseMultiValue(
        url.searchParams,
        "model_routing_status"
    );
    const capabilityStatuses = parseMultiValue(url.searchParams, "capability_status");
    const providerAvailabilityStatuses = parseMultiValue(
        url.searchParams,
        "provider_availability_status"
    );
    const providerAvailabilityReasons = parseMultiValue(
        url.searchParams,
        "provider_availability_reason"
    );
    const modelIds = [
        ...parseMultiValue(url.searchParams, "model_id"),
        ...parseMultiValue(url.searchParams, "id"),
    ];
    const organisationIds = parseMultiValue(url.searchParams, "organisation");
    const inputTypes = parseMultiValue(url.searchParams, "input_types");
    const outputTypes = parseMultiValue(url.searchParams, "output_types");
    const params = parseMultiValue(url.searchParams, "params");
    const availabilityMode = parseAvailabilityMode(url.searchParams.get("availability"));
    if (availabilityMode === null) {
        return json(
            {
                ok: false,
                error: "invalid_request",
                message: "availability must be one of: active, all",
            },
            400,
            { "Cache-Control": "no-store" }
        );
    }

    try {
        const catalogue = await fetchCatalogue({
            endpoints,
            statuses,
            providerIds,
            providerStatuses,
            providerRoutingStatuses,
            modelRoutingStatuses,
            capabilityStatuses,
            providerAvailabilityStatuses,
            providerAvailabilityReasons,
            organisationIds,
            inputTypes,
            outputTypes,
            params,
            availability: availabilityMode,
        });
        const freeRouterModel = await buildFreeRouterCatalogueModel({
            workspaceId: auth.value.workspaceId,
            apiKeyId: auth.value.apiKeyId,
            endpoints,
            catalogue,
        });
        const enrichedCatalogue =
            freeRouterModel && !catalogue.some((model) => model.model_id === freeRouterModel.model_id)
                ? [freeRouterModel, ...catalogue]
                : catalogue;
        const replacementByPreviousModel = buildReplacementByPreviousModel(enrichedCatalogue);
        const models = enrichedCatalogue
            .filter((model) => !modelIds.length || modelIds.includes(model.model_id))
            .map((model) =>
                toRichModel(model, replacementByPreviousModel.get(model.model_id) ?? null)
            );
        const paged = models.slice(offset, offset + limit);
        const headers = cacheHeaders(cacheOptions);
        if (requestedFormat.format !== "json") {
            const items: FeedItem[] = paged.map((model) => ({
                id: model.model_id,
                title: model.name?.trim() || model.model_id,
                summary: model.description,
                updatedAt: model.release_date,
            }));
            return buildFeedResponse({
                url,
                format: requestedFormat.format,
                title: "Phaseo Gateway Models",
                description: "Gateway-served AI models available via Phaseo.",
                items,
                headers,
            });
        }
        return json(
            {
                ok: true,
                privacy_scope: "shared",
                availability_mode: availabilityMode,
                limit,
                offset,
                total: models.length,
                models: paged,
            },
            200,
            headers
        );
    } catch (error: any) {
        return json(
            { ok: false, error: "failed", message: String(error?.message ?? error) },
            500,
            { "Cache-Control": "no-store" }
        );
    }
}

export async function handleMyModels(req: Request) {
    const auth = await guardAuth(req);
    if (!auth.ok) {
        return (auth as GuardErr).response;
    }

    return json(
        {
            status_code: 501,
            error: "not_implemented",
            description:
                "GET /models/me is reserved for future guardrail-aware model filtering and is not implemented yet. Use /models for the shared gateway catalogue.",
        },
        501,
        { "Cache-Control": "no-store" }
    );
}

export const modelsRoutes = new Hono<Env>();

modelsRoutes.get("/me", withRuntime((req) => handleMyModels(req)));
modelsRoutes.get("/", withRuntime((req) => handleModels(req)));
