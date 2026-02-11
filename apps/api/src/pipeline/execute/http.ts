// lib/gateway/execute/http.ts
// Purpose: Execute-stage logic for routing, attempts, and provider health.
// Why: Centralizes execution/failover behavior.
// How: Standardized execute-stage error response helpers.

export type ExecuteErrorCode =
    | "unsupported_model_or_endpoint"
    | "unsupported_modalities"
    | "pricing_not_configured"
    | "upstream_error";

export function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
}

const STATUS: Record<ExecuteErrorCode, number> = {
    unsupported_model_or_endpoint: 400,
    unsupported_modalities: 400,
    pricing_not_configured: 402,
    upstream_error: 502,
};

const FRIENDLY_DESCRIPTIONS: Partial<Record<ExecuteErrorCode, string>> = {
    unsupported_model_or_endpoint:
        "Unsupported model or endpoint. Please check https://ai-stats.phaseo.app/models for your model id, or the API Reference at https://docs.ai-stats.phaseo.app/v1/api-reference for valid endpoints.",
};

export function err(code: ExecuteErrorCode, payload: Record<string, unknown>) {
    const description = FRIENDLY_DESCRIPTIONS[code];
    const body = { error: code, ...payload } as Record<string, unknown>;
    if (description) body.description = description;
    return json(body, STATUS[code]);
}










