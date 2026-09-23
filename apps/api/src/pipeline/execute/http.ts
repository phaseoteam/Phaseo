// lib/gateway/execute/http.ts
// Purpose: Execute-stage logic for routing, attempts, and provider health.
// Why: Centralizes execution/failover behavior.
// How: Standardized execute-stage error response helpers.

import { normalizeGatewayErrorPayload } from "../error-contract";

export type ExecuteErrorCode =
    | "unsupported_model_or_endpoint"
    | "unsupported_modalities"
    | "pricing_not_configured"
    | "provider_payment_required"
    | "model_region_unavailable"
	| "provider_capacity_exhausted"
	| "byok_credentials_required"
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
    model_region_unavailable: 403,
	provider_capacity_exhausted: 429,
	byok_credentials_required: 400,
    upstream_error: 502,
};

const FRIENDLY_DESCRIPTIONS: Partial<Record<ExecuteErrorCode, string>> = {
    unsupported_model_or_endpoint:
        "Unsupported model or endpoint. Please check https://phaseo.app/models for your model id, or the API Reference at https://phaseo.app/docs/v1/api-reference for valid endpoints.",
    provider_payment_required:
        "Oops, we forgot to pay our provider bills. Please try again in a few minutes.",
};

export function err(code: ExecuteErrorCode, payload: Record<string, unknown>) {
    const description = FRIENDLY_DESCRIPTIONS[code];
    const body = { error: code, ...payload } as Record<string, unknown>;
    if (description && typeof body.description !== "string") body.description = description;
    if (typeof body.status_code !== "number") body.status_code = STATUS[code];
    if (typeof body.error_type !== "string") {
        body.error_type = [
            "provider_payment_required",
            "provider_capacity_exhausted",
            "upstream_error",
        ].includes(code)
            ? "system"
            : "user";
    }
    if (typeof body.error_origin !== "string") {
        body.error_origin = [
            "provider_payment_required",
            "provider_capacity_exhausted",
            "upstream_error",
        ].includes(code)
            ? "upstream"
            : "user";
    }
    if (typeof body.generation_id !== "string" && typeof body.request_id === "string") {
        body.generation_id = body.request_id;
    }
    return json(
        normalizeGatewayErrorPayload(body, {
            statusCode: STATUS[code],
            errorType: body.error_type as string,
            errorOrigin: body.error_origin as string,
            requestId:
                typeof body.request_id === "string"
                    ? body.request_id
                    : typeof body.generation_id === "string"
                        ? body.generation_id
                        : null,
        }),
        STATUS[code],
    );
}





