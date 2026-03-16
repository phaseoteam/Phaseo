// Helper functions for monitor models

import type { GatewayModel } from "./types";

// Helper function to parse modalities from database
export const parseModalities = (value: unknown): string[] => {
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
            .split(/[\,\s]+/)
            .map((part) => part.trim())
            .filter((part) => part.length > 0);
    }
    return [];
};

export const collectParamTokens = (value: unknown, tokens: string[] = []): string[] => {
    if (Array.isArray(value)) {
        for (const item of value) {
            collectParamTokens(item, tokens);
        }
        return tokens;
    }
    if (value && typeof value === "object") {
        for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
            tokens.push(String(key));
            collectParamTokens(val, tokens);
        }
        return tokens;
    }
    if (value !== null && value !== undefined) {
        tokens.push(String(value));
    }
    return tokens;
};

export const normalizeFeatureKey = (raw: string): string | null => {
    const cleaned = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (!cleaned) return null;
    if (cleaned.includes("reasoning") || cleaned.includes("thinking")) {
        return "reasoning";
    }
    if (cleaned.includes("tool") || cleaned.includes("function_call")) {
        return "tools";
    }
    if (
        cleaned.includes("structured_output") ||
        cleaned.includes("structured_outputs") ||
        cleaned.includes("response_format") ||
        cleaned.includes("json_schema")
    ) {
        return "structured_outputs";
    }
    if (
        cleaned.includes("web_search") ||
        cleaned.includes("websearch") ||
        cleaned.includes("native_web_search") ||
        (cleaned.includes("web") && cleaned.includes("search"))
    ) {
        return "web_search";
    }
    return null;
};

export const extractFeatureKeys = (params: unknown): string[] => {
    const tokens = collectParamTokens(params);
    const features = new Set<string>();
    for (const token of tokens) {
        const key = normalizeFeatureKey(token);
        if (key) features.add(key);
    }
    return Array.from(features);
};

const IGNORED_PARAMETER_KEYS = new Set<string>([
    "type",
    "title",
    "description",
    "default",
    "minimum",
    "maximum",
    "enum",
    "oneof",
    "anyof",
    "allof",
    "items",
    "properties",
    "required",
    "nullable",
    "additionalproperties",
    "$schema",
    "$id",
    "strict",
]);

function collectParamKeys(value: unknown, keys: string[] = []): string[] {
    if (Array.isArray(value)) {
        for (const item of value) {
            collectParamKeys(item, keys);
        }
        return keys;
    }

    if (value && typeof value === "object") {
        for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
            keys.push(String(key));
            collectParamKeys(val, keys);
        }
    }

    return keys;
}

function normalizeSupportedParameterKey(raw: string): string | null {
    const normalized = raw
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .replace(/[\s./-]+/g, "_")
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");

    if (!normalized) return null;
    if (IGNORED_PARAMETER_KEYS.has(normalized)) return null;
    if (/^\d+$/.test(normalized)) return null;
    if (normalized.length < 2) return null;

    return normalized;
}

export const extractSupportedParameters = (params: unknown): string[] => {
    const keys = collectParamKeys(params);
    const normalized = new Set<string>();

    for (const key of keys) {
        const param = normalizeSupportedParameterKey(key);
        if (param) normalized.add(param);
    }

    return Array.from(normalized).sort((a, b) => a.localeCompare(b));
};

export const normalizeGatewayModel = (raw: any): GatewayModel => {
    const providerRaw = Array.isArray(raw?.provider)
        ? raw.provider[0]
        : raw?.provider;

    return {
        model_id: raw?.model_id,
        api_model_id: raw?.api_model_id,
        api_provider_id: raw?.api_provider_id,
        key: raw?.key,
        endpoint: raw?.endpoint,
        is_active_gateway: raw?.is_active_gateway,
        capability_status: raw?.capability_status,
        input_modalities: raw?.input_modalities,
        output_modalities: raw?.output_modalities,
        params: raw?.params,
        provider: providerRaw ?? null,
    };
};

export const normalizeCapabilityStatus = (value: unknown): string => {
    const normalized = String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
    if (!normalized) return "";
    if (normalized === "not_active") return "inactive";
    if (normalized === "de_ranked" || normalized === "deranked") {
        return "deranked_lvl1";
    }
    if (normalized === "deranked_lvl_1") return "deranked_lvl1";
    if (normalized === "deranked_lvl_2") return "deranked_lvl2";
    if (normalized === "deranked_lvl_3") return "deranked_lvl3";
    return normalized;
};

export const resolveGatewayStatus = (
    isActiveGateway: boolean | null | undefined,
    capabilityStatus: unknown
): string => {
    const normalizedCapabilityStatus = normalizeCapabilityStatus(capabilityStatus);

    if (normalizedCapabilityStatus === "disabled") return "disabled";
    if (normalizedCapabilityStatus.startsWith("deranked")) {
        return normalizedCapabilityStatus;
    }
    if (
        normalizedCapabilityStatus &&
        normalizedCapabilityStatus !== "active" &&
        normalizedCapabilityStatus !== "inactive"
    ) {
        return normalizedCapabilityStatus;
    }

    if (normalizedCapabilityStatus === "inactive") return "inactive";
    return isActiveGateway ? "active" : "inactive";
};

export const normalizeEndpoint = (endpoint?: string | null) => {
    const trimmed = endpoint?.replace(/\uFFFD/g, "").trim();
    return trimmed || "";
};

/**
 * Convert a pricing rule value into USD per 1,000,000 units.
 * For token meters this yields the table display unit ($ / 1M tokens).
 */
export const toUsdPerMillion = (
    pricePerUnitRaw: unknown,
    unitSizeRaw: unknown
): number => {
    const pricePerUnit = Number(pricePerUnitRaw ?? 0);
    const unitSize = Number(unitSizeRaw ?? 1);

    if (!Number.isFinite(pricePerUnit) || pricePerUnit <= 0) return 0;
    if (!Number.isFinite(unitSize) || unitSize <= 0) return 0;

    return pricePerUnit * (1_000_000 / unitSize);
};
