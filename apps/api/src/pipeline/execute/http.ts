// lib/gateway/execute/http.ts
// Purpose: Execute-stage logic for routing, attempts, and provider health.
// Why: Centralizes execution/failover behavior.
// How: Standardized execute-stage error response helpers.

export type ExecuteErrorCode =
    | "unsupported_model_or_endpoint"
    | "unsupported_modalities"
    | "pricing_not_configured"
    | "provider_payment_required"
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
    provider_payment_required: 502,
    upstream_error: 502,
};

const FRIENDLY_DESCRIPTIONS: Partial<Record<ExecuteErrorCode, string>> = {
    unsupported_model_or_endpoint:
        "Unsupported model or endpoint. Please check https://phaseo.app/models for your model id, or the API Reference at https://docs.phaseo.app/v1/api-reference for valid endpoints.",
    provider_payment_required:
        "Oops, we forgot to pay our provider bills. Please try again in a few minutes.",
};

export function err(code: ExecuteErrorCode, payload: Record<string, unknown>) {
    const description = FRIENDLY_DESCRIPTIONS[code];
    const body = { error: code, ...payload } as Record<string, unknown>;
    if (description && typeof body.description !== "string") body.description = description;
    return json(body, STATUS[code]);
}










