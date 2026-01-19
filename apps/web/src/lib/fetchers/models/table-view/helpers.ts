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
        input_modalities: raw?.input_modalities,
        output_modalities: raw?.output_modalities,
        params: raw?.params,
        provider: providerRaw ?? null,
    };
};

export const normalizeEndpoint = (endpoint?: string | null) => {
    const trimmed = endpoint?.replace(/\uFFFD/g, "").trim();
    return trimmed || "";
};