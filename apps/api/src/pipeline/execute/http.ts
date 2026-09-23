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
    | "provider_request_rejected"
    | "provider_feature_unsupported"
    | "provider_service_unavailable"
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
    provider_request_rejected: 400,
    provider_feature_unsupported: 400,
    provider_service_unavailable: 503,
    byok_credentials_required: 400,
    upstream_error: 502,
};

export function err(code: ExecuteErrorCode, payload: Record<string, unknown>) {
    const body = { error: code, ...payload } as Record<string, unknown>;
    if (typeof body.status_code !== "number") body.status_code = STATUS[code];
    if (typeof body.error_type !== "string") {
        body.error_type = [
            "provider_payment_required",
            "provider_capacity_exhausted",
            "provider_service_unavailable",
            "upstream_error",
        ].includes(code)
            ? "system"
            : "user";
    }
    if (typeof body.error_origin !== "string") {
        body.error_origin = [
            "provider_payment_required",
            "provider_capacity_exhausted",
            "provider_service_unavailable",
            "provider_request_rejected",
            "provider_feature_unsupported",
            "upstream_error",
        ].includes(code)
            ? "upstream"
            : "user";
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






