// lib/gateway/before/http.ts
export type ErrorCode =
    | "unauthorised"
    | "invalid_json"
    | "validation_error"
    | "model_required"
    | "upstream_error"
    | "key_limit_exceeded"
    | "insufficient_funds"
    | "unsupported_model_or_endpoint";

export function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
}

const STATUS: Record<ErrorCode, number> = {
    unauthorised: 401,
    invalid_json: 400,
    validation_error: 400,
    model_required: 400,
    upstream_error: 502,
    key_limit_exceeded: 429,
    insufficient_funds: 402,
    unsupported_model_or_endpoint: 400,
};

const FRIENDLY_DESCRIPTIONS: Partial<Record<ErrorCode, string>> = {
    unsupported_model_or_endpoint:
        "Unsupported model or endpoint. Please check https://ai-stats.phaseo.app/models for your model id, or the API Reference at https://docs.ai-stats.phaseo.app/v1/api-reference for valid endpoints.",
};

export function err(code: ErrorCode, payload: Record<string, unknown>) {
    const description = FRIENDLY_DESCRIPTIONS[code];
    const body = { error: code, ...payload } as Record<string, unknown>;
    if (description) body.description = description;
    return json(body, STATUS[code]);
}
