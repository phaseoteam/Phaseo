// lib/gateway/before/http.ts
// Purpose: Before-stage helpers for auth, validation, and context building.
// Why: Keeps pre-execution logic centralized and consistent.
// How: Builds standardized error responses for before-stage failures.

export type ErrorCode =
    | "unauthorised"
    | "invalid_json"
    | "validation_error"
    | "not_found"
    | "not_implemented_yet"
    | "model_required"
    | "gateway_error"
    | "upstream_error"
    | "not_supported"
    | "not_ready"
    | "key_limit_exceeded"
    | "insufficient_funds"
    | "guardrail_blocked"
    | "unsupported_model_or_endpoint";

export function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
}

function defaultErrorType(code: ErrorCode): "user" | "system" {
    if (
        code === "upstream_error" ||
        code === "gateway_error" ||
        code === "key_limit_exceeded" ||
        code === "insufficient_funds"
    ) {
        return "system";
    }
    return "user";
}

function defaultErrorOrigin(code: ErrorCode): "user" | "gateway" | "upstream" {
    if (code === "upstream_error") return "upstream";
    if (code === "gateway_error") return "gateway";
    return "user";
}

function inferProviderFailureDiagnostics(
    code: ErrorCode,
    payload: Record<string, unknown>,
): Record<string, unknown> | null {
    if (code !== "upstream_error") return null;
    if (payload.provider_failure_diagnostics && typeof payload.provider_failure_diagnostics === "object") {
        return payload.provider_failure_diagnostics as Record<string, unknown>;
    }
    const reason = typeof payload.reason === "string" ? payload.reason.trim().toLowerCase() : "";
    const provider = typeof payload.provider === "string" ? payload.provider : null;
    if (!reason) return null;

    if (reason.endsWith("_key_missing") || reason.includes("key_missing")) {
        return {
            category: "credentials_not_configured",
            hint: "Provider credentials are not configured for this route. Verify gateway keys or the selected BYOK configuration before retrying.",
            provider,
        };
    }

    if (reason.endsWith("_model_missing") || reason.includes("status_unsupported") || reason.includes("content_unsupported")) {
        return {
            category: "model_unavailable_for_endpoint",
            hint: "The provider does not appear to expose this model on the requested endpoint yet.",
            provider,
        };
    }

    if (reason.endsWith("_timeout")) {
        return {
            category: "server_error",
            hint: "The provider timed out while handling this request. Retrying later may succeed.",
            provider,
        };
    }

    if (
        reason.endsWith("_request_failed") ||
        reason.endsWith("_fetch_failed") ||
        reason.includes("generation_failed")
    ) {
        return {
            category: "server_error",
            hint: "The provider returned an upstream failure while handling this request. Retrying later may succeed.",
            provider,
        };
    }

    return null;
}

const STATUS: Record<ErrorCode, number> = {
    unauthorised: 401,
    invalid_json: 400,
    validation_error: 400,
    not_found: 404,
    not_implemented_yet: 501,
    model_required: 400,
    gateway_error: 500,
    upstream_error: 502,
    not_supported: 400,
    not_ready: 409,
    key_limit_exceeded: 429,
    insufficient_funds: 402,
    guardrail_blocked: 403,
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
    if (typeof body.status_code !== "number") body.status_code = STATUS[code];
    if (typeof body.error_type !== "string") body.error_type = defaultErrorType(code);
    if (typeof body.error_origin !== "string") body.error_origin = defaultErrorOrigin(code);
    if (typeof body.generation_id !== "string" && typeof body.request_id === "string") {
        body.generation_id = body.request_id;
    }
    const providerFailureDiagnostics = inferProviderFailureDiagnostics(code, body);
    if (providerFailureDiagnostics) {
        body.provider_failure_diagnostics = providerFailureDiagnostics;
    }
    return json(body, STATUS[code]);
}










