import { isStealthModel } from "../stealth";

const STEALTH_PROVIDER = "stealth";

const PROVIDER_KEYS = new Set(["provider", "provider_id", "providerId"]);
const MODEL_KEYS = new Set([
    "model",
    "model_id",
    "modelId",
    "api_model_id",
    "apiModelId",
    "provider_api_model_id",
    "providerApiModelId",
    "provider_model_slug",
    "providerModelSlug",
]);
const PROVIDER_MODEL_KEYS = new Set(["provider_model_id", "providerModelId"]);
const UPSTREAM_KEYS = new Set(["upstream_route", "upstreamRoute", "upstream_url", "upstreamUrl"]);

function publicModelFor(args: Record<string, unknown>): string | null {
    const requested = args.requestedModel;
    if (isStealthModel(requested)) return requested.trim();
    const model = args.model;
    return isStealthModel(model) ? model.trim() : null;
}

export function sanitizeStealthMetadata(value: unknown, publicModel: string): unknown {
    if (Array.isArray(value)) {
        return value.map((entry) => sanitizeStealthMetadata(entry, publicModel));
    }
    if (!value || typeof value !== "object") return value;

    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
        if (PROVIDER_KEYS.has(key)) return [key, STEALTH_PROVIDER];
        if (MODEL_KEYS.has(key)) return [key, publicModel];
        if (PROVIDER_MODEL_KEYS.has(key)) return [key, `${STEALTH_PROVIDER}:${publicModel}`];
        if (UPSTREAM_KEYS.has(key)) return [key, null];
        return [key, sanitizeStealthMetadata(entry, publicModel)];
    }));
}

/**
 * Converts routing-only identity into the synthetic identity before any database write.
 * Provider request/response bodies are deliberately discarded because arbitrary upstream
 * payloads and URLs cannot be proven free of provider-identifying information.
 */
export function protectStealthAuditArgs<T extends Record<string, any>>(args: T): T {
    const publicModel = publicModelFor(args);
    if (!publicModel) return args;

    return {
        ...args,
        model: publicModel,
        requestedModel: publicModel,
        provider: STEALTH_PROVIDER,
        providerApiModelId: publicModel,
        providerModelSlug: publicModel,
        providerAttempts: sanitizeStealthMetadata(args.providerAttempts, publicModel),
        detailMetadata: sanitizeStealthMetadata(args.detailMetadata, publicModel),
        traceData: sanitizeStealthMetadata(args.traceData, publicModel),
        pricingLines: sanitizeStealthMetadata(args.pricingLines, publicModel),
        errorPayload: sanitizeStealthMetadata(args.errorPayload, publicModel),
        errorMessage: args.errorMessage ? "Upstream request failed" : args.errorMessage,
        gatewayResponse: sanitizeStealthMetadata(args.gatewayResponse, publicModel),
        providerRequest: null,
        providerResponse: null,
        serverToolTrace: null,
		lifecycleEvents: null,
    } as T;
}
