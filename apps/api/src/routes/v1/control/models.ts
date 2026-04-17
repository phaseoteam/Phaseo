// Purpose: Gateway models catalogue route.
// Why: Expose rich model metadata with compatibility fields.
// How: Loads catalogue rows, enriches each model, and returns paged results.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { guardAuth, type GuardErr } from "@pipeline/before/guards";
import { json, withRuntime, cacheHeaders } from "@/routes/utils";
import {
    fetchCatalogue,
    type CatalogueModel,
    type PricingMeterSummary,
    type PricingSummary,
} from "./models.catalogue";
import { buildFeedResponse, parseFeedFormat, type FeedItem } from "./models.feeds";

type ModelVisibilityScope = "shared" | "team";
type LifecycleStatus = "active" | "deprecated" | "retired" | null;

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
    if (endpoints.some((endpoint) => endpoint === "chat/completions" || endpoint === "messages" || endpoint === "responses")) {
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
        prompt: meterToUnitPrice(meters.input_text_tokens),
        completion: meterToUnitPrice(meters.output_text_tokens),
        request: null,
        image: meterToUnitPrice(
            meters.output_image ?? meters.input_image ?? meters.input_image_tokens ?? meters.output_image_tokens
        ),
        input_cache_read: meterToUnitPrice(meters.cached_read_text_tokens),
        input_cache_write: meterToUnitPrice(meters.cached_write_text_tokens),
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
    const displayName = model.name?.trim() || model.model_id;
    if (!model.endpoints.length) {
        return `${displayName} via AI Stats Gateway.`;
    }
    return `${displayName} via AI Stats Gateway. Supports ${model.endpoints.join(", ")}.`;
}

function toRichModel(model: CatalogueModel, replacementModelId: string | null) {
    const { previous_model_id: _previousModelId, ...publicModel } = model;
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
        pricing_detail: legacyPricing,
        pricing: toCompatibilityPricing(legacyPricing),
        per_request_limits: null,
    };
}

async function handleModels(req: Request, scope: ModelVisibilityScope) {
    const url = new URL(req.url);
    if (hasDeprecatedPrivacyScopeQuery(url)) {
        return json(
            {
                ok: false,
                error: "invalid_request",
                message: "privacy_scope query is no longer supported. Use /gateway/models for shared or /gateway/models/me for team-scoped listings.",
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

    const cacheScope = scope === "team" ? `models:team:${auth.value.teamId}:v1` : "models:shared:v1";

    const cacheOptions = {
        scope: cacheScope,
        ttlSeconds: 1800,
        staleSeconds: 1800,
        varyHeaders: [],
    };

    const endpoints = parseMultiValue(url.searchParams, "endpoints");
    const organisationIds = parseMultiValue(url.searchParams, "organisation");
    const inputTypes = parseMultiValue(url.searchParams, "input_types");
    const outputTypes = parseMultiValue(url.searchParams, "output_types");
    const params = parseMultiValue(url.searchParams, "params");
    try {
        const catalogue = await fetchCatalogue({
            endpoints,
            organisationIds,
            inputTypes,
            outputTypes,
            params,
        });
        const replacementByPreviousModel = buildReplacementByPreviousModel(catalogue);
        const models = catalogue.map((model) =>
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
                title: "AI Stats Gateway Models",
                description: "Gateway-served AI models available via AI Stats.",
                items,
                headers,
            });
        }
        return json(
            { ok: true, privacy_scope: scope, limit, offset, total: models.length, models: paged },
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

export const modelsRoutes = new Hono<Env>();

modelsRoutes.get("/me", withRuntime((req) => handleModels(req, "team")));
modelsRoutes.get("/", withRuntime((req) => handleModels(req, "shared")));

