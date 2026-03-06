// Purpose: Gateway models catalogue route.
// Why: Expose rich model metadata with OpenRouter-style compatibility fields.
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

type PrivacyScope = "shared" | "team";

type OpenRouterPricing = {
    prompt: string | null;
    completion: string | null;
    request: string | null;
    image: string | null;
    input_cache_read: string | null;
    input_cache_write: string | null;
    web_search: string | null;
};

type OpenRouterArchitecture = {
    modality: string;
    input_modalities: string[];
    output_modalities: string[];
    tokenizer: string | null;
    instruct_type: string | null;
};

type OpenRouterTopProvider = {
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

function parsePrivacyScope(url: URL): PrivacyScope | null {
    const raw = (url.searchParams.get("privacy_scope") ?? url.searchParams.get("privacy") ?? "shared")
        .trim()
        .toLowerCase();
    if (raw === "shared") return "shared";
    if (raw === "team") return "team";
    return null;
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

function toOpenRouterPricing(pricing: PricingSummary): OpenRouterPricing {
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

function toOpenRouterArchitecture(model: CatalogueModel): OpenRouterArchitecture {
    return {
        modality: inferModality(model.input_types, model.output_types),
        input_modalities: [...model.input_types],
        output_modalities: [...model.output_types],
        tokenizer: null,
        instruct_type: inferInstructType(model.endpoints),
    };
}

function toOpenRouterTopProvider(model: CatalogueModel): OpenRouterTopProvider {
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

function toRichModel(model: CatalogueModel) {
    const legacyTopProvider = model.top_provider;
    const legacyPricing = model.pricing;
    return {
        ...model,
        id: model.model_id,
        canonical_slug: model.model_id,
        created: toUnixSeconds(model.release_date),
        description: buildDescription(model),
        architecture: toOpenRouterArchitecture(model),
        top_provider_id: legacyTopProvider,
        top_provider: toOpenRouterTopProvider(model),
        supported_parameters: [...model.supported_params],
        pricing_detail: legacyPricing,
        pricing: toOpenRouterPricing(legacyPricing),
        per_request_limits: null,
    };
}

async function handleModels(req: Request) {
    const url = new URL(req.url);
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

    const auth = await guardAuth(req, { useKvCache: false });
    if (!auth.ok) {
        return (auth as GuardErr).response;
    }

    const privacyScope = parsePrivacyScope(url);
    if (!privacyScope) {
        return json(
            {
                ok: false,
                error: "invalid_request",
                message: "privacy_scope must be one of: shared, team",
            },
            400,
            { "Cache-Control": "no-store" }
        );
    }

    const cacheScope = privacyScope === "team" ? `models:team:${auth.value.teamId}:v1` : "models:shared:v1";

    if (privacyScope === "team") {
        return json(
            {
                ok: false,
                error: "not_implemented",
                code: "models_privacy_scope_not_implemented",
                message: "privacy_scope=team is reserved for future privacy-filtered model listing and is not implemented yet.",
                privacy_scope: "team",
            },
            501,
            { "Cache-Control": "no-store" }
        );
    }

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
        const models = catalogue.map(toRichModel);
        const paged = models.slice(offset, offset + limit);
        return json(
            { ok: true, privacy_scope: privacyScope, limit, offset, total: models.length, models: paged },
            200,
            cacheHeaders(cacheOptions)
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

modelsRoutes.get("/", withRuntime(handleModels));

