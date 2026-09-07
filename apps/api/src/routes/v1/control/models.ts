// Purpose: Gateway models catalogue route.
// Why: Expose Phaseo-native model metadata for discovery and routing decisions.
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
    scopePricingSummary,
    type CatalogueModel,
    type PricingMeterSummary,
    type PricingSummary,
    type SupportedParamDetail,
    type SupportedParamDetails,
} from "./models.catalogue";
import { buildFeedResponse, parseFeedFormat, type FeedItem } from "./models.feeds";
import { getEndpointMetadata } from "./endpoint-metadata";
import { getBindingsIfConfigured, getSupabaseAdmin } from "@/runtime/env";
import { normalizeGatewayRoutingRegion } from "@pipeline/before/deployment-region";

type LifecycleStatus = "active" | "deprecated" | "retired" | null;
type AvailabilityMode = "active" | "all";

type ModelVariantLink = {
    model_id: string;
    name: string;
};

type ModelVariantLinks = Record<string, ModelVariantLink>;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 250;
const MAX_OFFSET = 5000;
const FREE_ROUTER_MODEL_ID = "phaseo/free";
const FREE_ROUTER_NAME = "Phaseo Free Router";
const FREE_ROUTER_ENDPOINTS = ["chat/completions", "responses", "messages"] as const;

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

function parseMultiValueAliases(params: URLSearchParams, names: string[]): string[] {
    return Array.from(new Set(names.flatMap((name) => parseMultiValue(params, name))));
}

function parsePathSegments(req: Request): string[] | null {
    try {
        return new URL(req.url).pathname
            .split("/")
            .map((segment) => decodeURIComponent(segment))
            .filter(Boolean);
    } catch (error) {
        if (error instanceof URIError) return null;
        throw error;
    }
}

function parseEndpointRouteModelId(req: Request): string | null {
    const segments = parsePathSegments(req);
    if (!segments) return null;
    const endpointsIndex = segments.lastIndexOf("endpoints");
    if (endpointsIndex < 2) return null;
    const author = segments[endpointsIndex - 2];
    const slug = segments[endpointsIndex - 1];
    return author && slug ? `${author}/${slug}` : null;
}

function findCatalogueModel(catalogue: CatalogueModel[], modelId: string): CatalogueModel | null {
    return catalogue.find(
        (model) => model.model_id === modelId || model.aliases.includes(modelId),
    ) ?? null;
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

function detailNumber(model: CatalogueModel, names: string[]): number | null {
    for (const name of names) {
        const value = model.details?.[name];
        if (typeof value !== "number" && typeof value !== "string") continue;
        if (typeof value === "string" && value.trim() === "") continue;
        const parsed = typeof value === "number" ? value : Number(value);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return null;
}

function buildDescription(model: CatalogueModel, regional = false): string {
    if (model.model_id === FREE_ROUTER_MODEL_ID) {
        return "Routes each request to an eligible free model pool with provider-aware balancing.";
    }
    const curatedDescription = model.description?.trim();
    if (curatedDescription) return curatedDescription;
    const displayName = model.name?.trim() || model.model_id;
    const organization = model.organisation_name?.trim();
    const owner = organization ? ` by ${organization}` : "";
    const input = regional ? "text" : model.input_types.length ? model.input_types.join(", ") : "unspecified";
    const output = regional ? "text" : model.output_types.length ? model.output_types.join(", ") : "unspecified";
    const availability = model.availability.active_provider_count > 0
        ? `${model.availability.active_provider_count} active provider${model.availability.active_provider_count === 1 ? "" : "s"}`
        : model.availability.status.replace(/_/g, " ");
    const endpoints = model.endpoints.length
        ? ` Supports ${model.endpoints.join(", ")}.`
        : "";
    return `${displayName}${owner} accepts ${input} input and produces ${output} output. ${availability} through Phaseo.${endpoints}`;
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

function toModelOffer(model: CatalogueModel, provider: CatalogueModel["providers"][number], regional = false) {
    return {
        provider: {
            id: provider.api_provider_id,
            name: provider.api_provider_name ?? null,
        },
        model: provider.provider_model_slug ?? null,
        status: provider.availability_status,
        status_reason: provider.availability_reason,
        routable: provider.is_active_gateway,
        endpoints: [...(provider.endpoints ?? [])],
        modalities: {
            input: regional ? ["text"] : provider.input_modalities?.length ? [...provider.input_modalities] : [...model.input_types],
            output: regional ? ["text"] : provider.output_modalities?.length ? [...provider.output_modalities] : [...model.output_types],
        },
        residency: {
            execution_regions: [...(provider.execution_regions ?? [])],
            data_regions: [...(provider.data_regions ?? [])],
        },
        capabilities: {
            parameters: [...(provider.params ?? [])],
            parameter_details: cloneJsonObject(provider.params_detail ?? {}),
        },
        routing: {
            provider: provider.provider_routing_status,
            model: provider.model_routing_status,
            capability: provider.capability_status,
        },
        effective: {
            from: provider.effective_from,
            to: provider.effective_to,
        },
        pricing: model.provider_pricing?.[provider.api_provider_id]
            ?? scopePricingSummary(model.pricing, new Set([provider.api_provider_id])),
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
            base_model_id: FREE_ROUTER_MODEL_ID,
            variant_kind: "standard",
            previous_model_id: null,
            replacement_model_id: null,
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
            details: {},
            providers,
            provider_endpoint_capabilities: {},
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
            provider_pricing: {},
            provider_endpoint_pricing: {},
            availability: {
                status: "active",
                provider_count: providers.length,
                active_provider_count: providers.length,
                coming_soon_provider_count: 0,
                inactive_provider_count: 0,
            },
        };
    } catch {
        return null;
    }
}

function buildModelVariants(catalogue: CatalogueModel[]): Map<string, ModelVariantLinks> {
    const byBaseModel = new Map<string, ModelVariantLinks>();
    for (const model of catalogue) {
        const baseModelId = model.base_model_id || model.model_id;
        const kind = model.variant_kind || "standard";
        const variants = byBaseModel.get(baseModelId) ?? {};
        variants[kind] = {
            model_id: model.model_id,
            name: model.name?.trim() || model.model_id,
        };
        byBaseModel.set(baseModelId, variants);
    }
    return byBaseModel;
}

function toPhaseoModel(
    model: CatalogueModel,
    replacementModelId: string | null,
    variants: ModelVariantLinks,
	regional = false,
) {
    const lifecycleStatus = normalizeLifecycleStatus(model.status, model.deprecation_date, model.retirement_date);
    return {
        id: model.model_id,
        base_model_id: model.base_model_id || model.model_id,
        variant: model.variant_kind || "standard",
        variants,
        name: model.name?.trim() || model.model_id,
        description: buildDescription(model, regional),
        organization: model.organisation_id ? {
            id: model.organisation_id,
            name: model.organisation_name,
            color: model.organisation_colour,
        } : null,
        aliases: [...model.aliases],
        lifecycle: {
            status: lifecycleStatus,
            released_at: model.release_date,
            deprecated_at: model.deprecation_date,
            retires_at: model.retirement_date,
            replacement_id: replacementModelId,
            message: buildLifecycleMessage(
                lifecycleStatus,
                model.deprecation_date,
                model.retirement_date,
                replacementModelId
            ),
        },
        modalities: {
            input: regional ? ["text"] : [...model.input_types],
            output: regional ? ["text"] : [...model.output_types],
        },
        limits: {
            input_tokens: detailNumber(model, ["input_context_length", "context_length"]),
            output_tokens: detailNumber(model, ["output_context_length", "max_output_tokens", "max_completion_tokens"]),
        },
        capabilities: {
            endpoints: [...model.endpoints],
            parameters: [...model.supported_params],
            parameter_details: cloneJsonObject(model.supported_params_detail ?? {}),
        },
        availability: {
            status: model.availability.status,
            provider_count: model.availability.provider_count,
            active_provider_count: model.availability.active_provider_count,
            coming_soon_provider_count: model.availability.coming_soon_provider_count ?? 0,
            inactive_provider_count: model.availability.inactive_provider_count,
        },
        pricing: cloneJsonObject(model.pricing),
        offers: model.providers.map((provider) => toModelOffer(model, provider, regional)),
    };
}

async function fetchWorkspacePrivateCatalogue(args: {
    workspaceId: string;
    endpoints: string[];
    modelIds: string[];
    providerIds: string[];
    organisationIds: string[];
    inputTypes: string[];
    outputTypes: string[];
}) {
    if (args.providerIds.length && !args.providerIds.some((id) => id === "private" || id === "private-model")) return [];
    if (args.organisationIds.length && !args.organisationIds.includes("private")) return [];
    if (args.inputTypes.length && !args.inputTypes.includes("text")) return [];
    if (args.outputTypes.length && !args.outputTypes.includes("text")) return [];
    const { data, error } = await getSupabaseAdmin().from("workspace_private_models")
        .select("model_id,name,description,supports_responses,input_modalities,output_modalities,context_length,max_output_tokens,created_at")
        .eq("workspace_id", args.workspaceId)
        .eq("enabled", true)
        .order("model_id");
    if (error) throw new Error(`private_model_catalogue_failed:${error.message ?? "unknown"}`);
    return (data ?? []).flatMap((row: any) => {
        if (args.modelIds.length && !args.modelIds.includes(String(row.model_id))) return [];
        const availableEndpoints = ["chat/completions", "messages", ...(row.supports_responses ? ["responses"] : [])];
        if (args.endpoints.length && !args.endpoints.some((endpoint) => availableEndpoints.includes(endpoint))) return [];
        return [{
            id: String(row.model_id),
            base_model_id: String(row.model_id),
            variant: "standard",
            variants: {},
            name: String(row.name),
            description: String(row.description ?? "Workspace-owned private model."),
            organization: { id: "private", name: "Private", color: null },
            aliases: [],
            lifecycle: {
                status: "active",
                released_at: row.created_at ?? null,
                deprecated_at: null,
                retires_at: null,
                replacement_id: null,
                message: null,
            },
            modalities: {
                input: Array.isArray(row.input_modalities) ? row.input_modalities : ["text"],
                output: Array.isArray(row.output_modalities) ? row.output_modalities : ["text"],
            },
            limits: {
                input_tokens: row.context_length ?? null,
                output_tokens: row.max_output_tokens ?? null,
            },
            capabilities: { endpoints: availableEndpoints, parameters: [], parameter_details: {} },
            availability: {
                status: "active",
                provider_count: 1,
                active_provider_count: 1,
                coming_soon_provider_count: 0,
                inactive_provider_count: 0,
            },
            pricing: { pricing_plan: "byok", meters: {} },
            offers: [{
                provider: { id: "private-model", name: "Private" },
                model: String(row.model_id),
                status: "active",
                status_reason: null,
                routable: true,
                endpoints: availableEndpoints,
                modalities: {
                    input: Array.isArray(row.input_modalities) ? row.input_modalities : ["text"],
                    output: Array.isArray(row.output_modalities) ? row.output_modalities : ["text"],
                },
                residency: { execution_regions: [], data_regions: [] },
                capabilities: { parameters: [], parameter_details: {} },
                routing: { provider: "active", model: "active", capability: "active" },
                effective: { from: null, to: null },
                pricing: { pricing_plan: "byok", meters: {} },
            }],
        }];
    });
}

export async function handleModels(req: Request) {
    const url = new URL(req.url);
    const gatewayRegion = normalizeGatewayRoutingRegion(
		getBindingsIfConfigured()?.GATEWAY_ROUTING_REGION,
	);
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

    const auth = await guardAuth(req, { allowOAuthJwt: true });
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
    const inputTypes = parseMultiValueAliases(url.searchParams, ["input_types", "input_modalities"]);
    const outputTypes = parseMultiValueAliases(url.searchParams, ["output_types", "output_modalities"]);
    const params = parseMultiValueAliases(url.searchParams, ["params", "supported_parameters"]);
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
			...(gatewayRegion ? { region: gatewayRegion, textOnly: true } : {}),
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
        const variantsByBaseModel = buildModelVariants(enrichedCatalogue);
        const publicModels = enrichedCatalogue
            .filter((model) => !modelIds.length || modelIds.includes(model.model_id))
            .map((model) =>
                toPhaseoModel(
                    model,
                    model.replacement_model_id ?? replacementByPreviousModel.get(model.model_id) ?? null,
                    variantsByBaseModel.get(model.base_model_id || model.model_id) ?? {},
					gatewayRegion !== null,
                )
            );
        const privateModels = await fetchWorkspacePrivateCatalogue({
            workspaceId: auth.value.workspaceId,
            endpoints,
            modelIds,
            providerIds,
            organisationIds,
            inputTypes,
            outputTypes,
        });
        const privateByModelId = new Map(privateModels.map((model) => [model.id, model]));
        const mergedPublicModels = publicModels.map((model) => {
            const privateModel = privateByModelId.get(model.id);
            if (!privateModel) return model;
            privateByModelId.delete(model.id);
            return {
                ...model,
                offers: [...model.offers, ...privateModel.offers],
                availability: {
                    ...model.availability,
                    provider_count: model.availability.provider_count + privateModel.availability.provider_count,
                    active_provider_count: model.availability.active_provider_count + privateModel.availability.active_provider_count,
                },
            };
        });
        const models = [...privateByModelId.values(), ...mergedPublicModels];
        const paged = models.slice(offset, offset + limit);
        const headers = cacheHeaders({ ...cacheOptions, varyHeaders: ["Authorization"] });
        if (requestedFormat.format !== "json") {
            const items: FeedItem[] = paged.map((model) => ({
                id: model.id,
                title: model.name,
                summary: model.description,
                updatedAt: model.lifecycle.released_at,
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
                availability_mode: availabilityMode,
                gateway_region: gatewayRegion,
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

export async function handleModelEndpoints(req: Request) {
    const url = new URL(req.url);
    const modelId = parseEndpointRouteModelId(req);
    if (!modelId) {
        return json(
            {
                ok: false,
                error: "invalid_request",
                message: "Model path must be /models/{author}/{slug}/endpoints.",
            },
            400,
            { "Cache-Control": "no-store" },
        );
    }

    const auth = await guardAuth(req, { allowOAuthJwt: true });
    if (!auth.ok) return (auth as GuardErr).response;
    const scopeError = requireCapability(auth.value, CAPABILITIES.MODELS_READ);
    if (scopeError) return scopeError;

    const availabilityMode = parseAvailabilityMode(url.searchParams.get("availability"));
    if (availabilityMode === null) {
        return json(
            {
                ok: false,
                error: "invalid_request",
                message: "availability must be one of: active, all",
            },
            400,
            { "Cache-Control": "no-store" },
        );
    }

    const providerIds = parseMultiValue(url.searchParams, "provider");
    const providerStatuses = parseMultiValue(url.searchParams, "provider_status");
    const providerRoutingStatuses = parseMultiValue(url.searchParams, "provider_routing_status");
    const modelRoutingStatuses = parseMultiValue(url.searchParams, "model_routing_status");
    const capabilityStatuses = parseMultiValue(url.searchParams, "capability_status");
    const providerAvailabilityStatuses = parseMultiValue(url.searchParams, "provider_availability_status");
    const providerAvailabilityReasons = parseMultiValue(url.searchParams, "provider_availability_reason");
    const statuses = parseMultiValue(url.searchParams, "status");
    const params = parseMultiValueAliases(url.searchParams, ["params", "supported_parameters"]);

    const sharedFilters = {
        providerIds,
        providerStatuses,
        providerRoutingStatuses,
        modelRoutingStatuses,
        capabilityStatuses,
        providerAvailabilityStatuses,
        providerAvailabilityReasons,
        statuses,
        availability: availabilityMode,
    } as const;

    try {
        const baseCatalogue = await fetchCatalogue(sharedFilters);
        const model = findCatalogueModel(baseCatalogue, modelId);
        if (!model) {
            return json(
                { ok: false, error: "not_found", message: `Model ${modelId} was not found.` },
                404,
                { "Cache-Control": "no-store" },
            );
        }

        const canonicalEndpoints = Array.from(new Set(
            model.endpoints.map((endpoint) => getEndpointMetadata(endpoint).id),
        ));
        const filteredCatalogue = await fetchCatalogue({
            ...sharedFilters,
            endpoints: canonicalEndpoints,
            params,
        });
        const filteredModel = findCatalogueModel(filteredCatalogue, model.model_id);
        const endpointModels = canonicalEndpoints.map((endpoint) => ({
            endpoint,
            model: filteredModel,
        }));

        const endpoints = endpointModels.flatMap(({ endpoint, model: endpointModel }) => {
            if (!endpointModel) return [];
            const metadata = getEndpointMetadata(endpoint);
            const endpointProviders = Object.entries(
                endpointModel.provider_endpoint_capabilities ?? {},
            ).flatMap(([providerId, capabilities]) =>
                Object.entries(capabilities)
                    .filter(([capabilityId]) => getEndpointMetadata(capabilityId).id === metadata.id)
                    .map(([capabilityId, provider]) => ({ providerId, capabilityId, provider })),
            );
            return endpointProviders.map(({ providerId, capabilityId, provider }) => {
                const pricing = endpointModel
                    .provider_endpoint_pricing?.[providerId]?.[capabilityId]
                    ?? endpointModel.provider_pricing?.[providerId]
                    ?? scopePricingSummary(endpointModel.pricing, new Set([providerId]));
                return {
                    id: `${providerId}:${metadata.id}`,
                    endpoint: metadata.id,
                    capability_id: capabilityId,
                    public_path: metadata.public_path,
                    collection: metadata.collection,
                    provider: {
                        id: providerId,
                        name: provider.api_provider_name,
                    },
                    model: provider.provider_model_slug,
                    routable: provider.is_active_gateway,
                    status: provider.availability_status,
                    status_reason: provider.availability_reason,
                    modalities: {
                        input: provider.input_modalities.length
                            ? [...provider.input_modalities]
                            : [...model.input_types],
                        output: provider.output_modalities.length
                            ? [...provider.output_modalities]
                            : [...model.output_types],
                    },
                    capabilities: {
                        parameters: [...provider.params],
                        parameter_details: cloneJsonObject(provider.params_detail ?? {}),
                    },
                    routing: {
                        provider: provider.provider_routing_status,
                        model: provider.model_routing_status,
                        capability: provider.capability_status,
                    },
                    effective: {
                        from: provider.effective_from,
                        to: provider.effective_to,
                    },
                    pricing,
                };
            });
        });

        return json(
            {
                ok: true,
                id: model.model_id,
                name: model.name?.trim() || model.model_id,
                description: buildDescription(model),
                organization: model.organisation_id ? {
                    id: model.organisation_id,
                    name: model.organisation_name,
                    color: model.organisation_colour,
                } : null,
                modalities: {
                    input: [...model.input_types],
                    output: [...model.output_types],
                },
                availability_mode: availabilityMode,
                endpoints,
            },
            200,
            cacheHeaders({
                scope: "models:endpoints:shared:v1",
                ttlSeconds: 1800,
                staleSeconds: 1800,
                varyHeaders: [],
            }),
        );
    } catch (error: any) {
        return json(
            { ok: false, error: "failed", message: String(error?.message ?? error) },
            500,
            { "Cache-Control": "no-store" },
        );
    }
}

export async function handleMyModels(req: Request) {
    const auth = await guardAuth(req, { allowOAuthJwt: true });
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
modelsRoutes.get("/:author/:slug/endpoints", withRuntime((req) => handleModelEndpoints(req)));
modelsRoutes.get("/", withRuntime((req) => handleModels(req)));
