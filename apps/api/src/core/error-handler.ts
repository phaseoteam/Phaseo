// src/lib/gateway/error-handler.ts
// Purpose: Normalize errors into gateway responses and emit audits/metrics.
// Why: Centralizes error handling for consistent client behavior.
// How: Parses upstream errors, builds payloads, sets headers, and triggers audits.

import type { Endpoint } from "./types";
import {
    isBodyOnlyTextSessionEndpoint,
    normalizeTextBodySessionId,
} from "./session-id";
import type { PipelineContext } from "@pipeline/before/types";
import { isDebugAllowed, logDebugEvent } from "@pipeline/debug";
import { readAttributionHeaders } from "@pipeline/after/attribution";
import { getEdgeMeta } from "./edge";
import { sanitizeForAxiom, stringifyForAxiom } from "@observability/privacy";
import { emitGatewayRequestEvent } from "@observability/events";

const REDACT_ERROR_KEYS = new Set([
    "messages",
    "message",
    "content",
    "input",
    "prompt",
    "text",
    "audio",
    "image",
    "video",
    "tools",
    "tool",
]);

function redactErrorValue(value: unknown, depth = 0): unknown {
    if (depth > 4) return "[truncated]";
    if (Array.isArray(value)) {
        return value.map((entry) => redactErrorValue(entry, depth + 1));
    }
    if (value && typeof value === "object") {
        const obj = value as Record<string, unknown>;
        const next: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(obj)) {
            if (REDACT_ERROR_KEYS.has(key)) {
                next[key] = "[redacted]";
            } else {
                next[key] = redactErrorValue(val, depth + 1);
            }
        }
        return next;
    }
    return value;
}

function headersToRecord(headers: Headers | null | undefined): Record<string, string> | null {
    if (!headers) return null;
    const out: Record<string, string> = {};
    let count = 0;
    for (const [key, value] of headers.entries()) {
        out[key] = value;
        count += 1;
        if (count >= 128) break;
    }
    return Object.keys(out).length > 0 ? out : null;
}

function normalizeBoundedString(value: unknown, maxLength: number): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function toExecuteFailureSample(
    value: unknown,
): Array<{
    provider: string | null;
    type: string | null;
    status: number | null;
    upstream_error_code: string | null;
    upstream_error_message: string | null;
    upstream_error_description: string | null;
    upstream_error_param: string | null;
    upstream_payload_preview: string | null;
    retryable: boolean | null;
}> | null {
    if (!Array.isArray(value) || value.length === 0) return null;
    const mapped = value.slice(0, 3).map((entry) => {
        const e = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
        const status = Number(e.status ?? NaN);
        return {
            provider: typeof e.provider === "string" ? e.provider : null,
            type: typeof e.type === "string" ? e.type : null,
            status: Number.isFinite(status) ? status : null,
            upstream_error_code:
                typeof e.upstream_error_code === "string" ? e.upstream_error_code : null,
            upstream_error_message:
                typeof e.upstream_error_message === "string" ? e.upstream_error_message : null,
            upstream_error_description:
                typeof e.upstream_error_description === "string"
                    ? e.upstream_error_description
                    : null,
            upstream_error_param:
                typeof e.upstream_error_param === "string" ? e.upstream_error_param : null,
            upstream_payload_preview:
                typeof e.upstream_payload_preview === "string"
                    ? e.upstream_payload_preview
                    : null,
            retryable: typeof e.retryable === "boolean" ? e.retryable : null,
        };
    });
    return mapped.length ? mapped : null;
}

function buildErrorDetails(body: unknown, ctx?: PipelineContext) {
    const attemptErrors = ctx ? (ctx as any).attemptErrors ?? null : null;
    const providerAttempts = ctx ? ctx.providerAttempts ?? null : null;
    const safeAttemptErrors = Array.isArray(attemptErrors)
        ? attemptErrors.map((entry) => {
            if (!entry || typeof entry !== "object") return entry;
            const e = entry as Record<string, unknown>;
            return {
                attempt_number: e.attempt_number ?? null,
                provider: e.provider ?? null,
                endpoint: e.endpoint ?? null,
                model: e.model ?? null,
                provider_model_slug: e.provider_model_slug ?? null,
                type: e.type ?? e.reason ?? null,
                reason: e.reason ?? null,
                message: e.message ?? null,
                status: e.status ?? null,
                status_text: e.status_text ?? null,
                code: e.code ?? null,
                key_source: e.key_source ?? null,
                byok_key_id: e.byok_key_id ?? null,
                upstream_url: e.upstream_url ?? null,
                upstream_error_code: e.upstream_error_code ?? null,
                upstream_error_type: e.upstream_error_type ?? null,
                upstream_error_message: e.upstream_error_message ?? null,
                upstream_error_description: e.upstream_error_description ?? null,
                upstream_error_param: e.upstream_error_param ?? null,
                upstream_payload_preview: e.upstream_payload_preview ?? null,
            };
        })
        : attemptErrors;
    const safeProviderAttempts = Array.isArray(providerAttempts)
        ? providerAttempts.map((entry) => {
            if (!entry || typeof entry !== "object") return entry;
            const e = entry as Record<string, unknown>;
            return {
                attempt_number: e.attempt_number ?? null,
                provider: e.provider ?? null,
                endpoint: e.endpoint ?? null,
                model: e.model ?? null,
                provider_model_slug: e.provider_model_slug ?? null,
                outcome: e.outcome ?? null,
                type: e.type ?? null,
                duration_ms: e.duration_ms ?? null,
                status: e.status ?? null,
                status_text: e.status_text ?? null,
                retryable: e.retryable ?? null,
                key_source: e.key_source ?? null,
                byok_key_id: e.byok_key_id ?? null,
                upstream_url: e.upstream_url ?? null,
                upstream_error_code: e.upstream_error_code ?? null,
                upstream_error_type: e.upstream_error_type ?? null,
                upstream_error_message: e.upstream_error_message ?? null,
                upstream_error_description: e.upstream_error_description ?? null,
                upstream_error_param: e.upstream_error_param ?? null,
                upstream_payload_preview: e.upstream_payload_preview ?? null,
                response_kind: e.response_kind ?? null,
                was_probe: e.was_probe ?? null,
                fallback_attempted: e.fallback_attempted ?? null,
                request_build_ms: e.request_build_ms ?? null,
                upstream_headers_ms: e.upstream_headers_ms ?? null,
                retry_delay_ms: e.retry_delay_ms ?? null,
            };
        })
        : providerAttempts;
    const details = {
        upstream_error: redactErrorValue(body ?? null),
        provider_attempts: safeProviderAttempts,
        attempt_errors: safeAttemptErrors,
    };
    try {
        return JSON.stringify(details);
    } catch {
        return null;
    }
}

// Helper to extract error code from a response body
export function extractErrorCode(body: any, fallback: string): string {
    const e = body?.error ?? body?.code ?? body?.error_code ?? body?.type;
    if (typeof e === "string") return e;
    if (typeof e === "number") return String(e);
    if (e && typeof e === "object") {
        if (typeof e.code === "string") return e.code;
        if (typeof e.status === "string") return e.status;
        if (typeof e.type === "string") return e.type;
        if (typeof e.error === "string") return e.error;
        if (typeof e.message === "string") return e.message.slice(0, 120);
    }
    if (typeof body?.message === "string") return body.message.slice(0, 120);
    return fallback;
}

// Helper to extract a user-facing description from a response body
export function extractErrorDescription(body: any): string | null {
    if (typeof body?.description === "string") return body.description;
    if (typeof body?.message === "string") return body.message;
    if (typeof body?.reason === "string") return body.reason;
    if (Array.isArray(body?.details) && body.details.length > 0) {
        const first = body.details[0];
        const path = Array.isArray(first?.path) ? first.path.join(".") : null;
        const message = typeof first?.message === "string" ? first.message : null;
        if (message && path) return `${message} at ${path}`;
        if (message) return message;
    }
    const e = body?.error ?? body;
    if (e && typeof e === "object") {
        if (typeof e.description === "string") return e.description;
        if (typeof e.message === "string") return e.message;
        if (typeof e.error_description === "string") return e.error_description;
    }
    if (typeof body?.error_description === "string") return body.error_description;
    if (typeof e === "string") return e;
    if (Array.isArray(body?.errors)) return body.errors.map((x: any) => (typeof x === 'string' ? x : JSON.stringify(x))).join(', ').slice(0, 200);
    return null;
}

// Classify error attribution for error header
export function classifyAttribution({ stage, status, errorCode, body }: { stage: "before" | "execute"; status?: number | null; errorCode?: string | null; body?: any }): "user" | "upstream" {
    if (stage === "before") {
        const s = Number(status ?? 0);
        const code = (errorCode || "").toLowerCase();
        if (
            s >= 500 ||
            code.includes("gateway") ||
            code.includes("upstream") ||
            code.includes("internal") ||
            code.includes("timeout") ||
            code.includes("routing") ||
            code.includes("executor")
        ) {
            return "upstream";
        }
        if (s >= 400) return "user";
        return "upstream";
    }
    const s = Number(status ?? 0);
    if (Number.isFinite(s)) {
        if (s >= 500) return "upstream";
        if (s === 408) return "upstream";
        if (s === 429) return "upstream";
        if (s >= 400 && s < 500) return "user";
    }
    const code = (errorCode || "").toLowerCase();
    if (code.includes("timeout") || code.includes("overload") || code.includes("rate")) return "upstream";
    if (code.includes("invalid") || code.includes("validation") || code.includes("unauth") || code.includes("forbidden") || code.includes("quota") || code.includes("insufficient")) return "user";
    const msg = (typeof body?.message === 'string' ? body.message : '') + ' ' + (typeof body?.error === 'string' ? body.error : '');
    const m = msg.toLowerCase();
    if (m.includes("timeout") || m.includes("overload") || m.includes("rate limit")) return "upstream";
    if (m.includes("invalid") || m.includes("unauthorized") || m.includes("forbidden") || m.includes("bad request")) return "user";
    return "upstream";
}

type UpstreamUnsupportedParamSignal = {
    internalCode: "UPSTREAM_UNSUPPORTED_PARAM" | "UPSTREAM_UNSUPPORTED_PARAM_COMBO";
    param: string | null;
    path: string | null;
    keyword: string | null;
};

function asPathString(value: unknown): string | null {
    if (Array.isArray(value)) {
        const parts = value
            .map((part) => (typeof part === "string" || typeof part === "number" ? String(part).trim() : ""))
            .filter(Boolean);
        return parts.length ? parts.join(".") : null;
    }
    if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
    }
    return null;
}

function extractParamFromMessage(message: string): string | null {
    const quoted = message.match(/["']([a-zA-Z0-9_.-]+)["']/);
    if (quoted?.[1]) return quoted[1];
    const named = message.match(/\bparameter[:\s]+([a-zA-Z0-9_.-]+)/i);
    if (named?.[1]) return named[1];
    const field = message.match(/\bfield[:\s]+([a-zA-Z0-9_.-]+)/i);
    if (field?.[1]) return field[1];
    return null;
}

function looksLikeUnsupportedParamMessage(message: string): boolean {
    const m = message.toLowerCase();
    return (
        (m.includes("unsupported") && (m.includes("parameter") || m.includes("field"))) ||
        m.includes("does not support") ||
        m.includes("not supported") ||
        m.includes("unknown parameter") ||
        m.includes("unknown field")
    );
}

export function extractUpstreamUnsupportedParamSignal(args: {
    stage: "before" | "execute";
    body: any;
}): UpstreamUnsupportedParamSignal | null {
    if (args.stage !== "execute") return null;
    const body = args.body;
    if (!body || typeof body !== "object") return null;

    const detailArrays: unknown[] = [];
    if (Array.isArray(body.details)) detailArrays.push(body.details);
    if (Array.isArray((body as any)?.error?.details)) detailArrays.push((body as any).error.details);
    if (Array.isArray((body as any)?.error?.errors)) detailArrays.push((body as any).error.errors);

    for (const list of detailArrays) {
        for (const rawDetail of list as any[]) {
            if (!rawDetail || typeof rawDetail !== "object") continue;
            const detail = rawDetail as Record<string, any>;
            const keyword = typeof detail.keyword === "string" ? detail.keyword.toLowerCase() : null;
            const message = typeof detail.message === "string" ? detail.message : "";
            const path = asPathString(detail.path);
            const param =
                (typeof detail?.params?.param === "string" && detail.params.param.trim()) ||
                path ||
                extractParamFromMessage(message) ||
                null;

            if (keyword === "unsupported_param_combo") {
                return {
                    internalCode: "UPSTREAM_UNSUPPORTED_PARAM_COMBO",
                    param,
                    path,
                    keyword,
                };
            }

            if (
                keyword === "unsupported_param" ||
                keyword === "unsupported_parameter" ||
                looksLikeUnsupportedParamMessage(message)
            ) {
                return {
                    internalCode: "UPSTREAM_UNSUPPORTED_PARAM",
                    param,
                    path,
                    keyword,
                };
            }
        }
    }

    const failureSample = Array.isArray((body as any)?.failure_sample)
        ? ((body as any).failure_sample as Array<Record<string, any>>)
        : [];
    for (const sample of failureSample) {
        if (!sample || typeof sample !== "object") continue;
        const sampleParam =
            typeof sample.upstream_error_param === "string"
                ? sample.upstream_error_param.trim()
                : "";
        const sampleMessage =
            typeof sample.upstream_error_message === "string"
                ? sample.upstream_error_message
                : "";
        const sampleDescription =
            typeof sample.upstream_error_description === "string"
                ? sample.upstream_error_description
                : "";
        const mergedMessage = `${sampleMessage} ${sampleDescription}`.trim();
        const paramSignalMessage = mergedMessage.toLowerCase();
        const hasParamSignal =
            paramSignalMessage.includes("param") ||
            paramSignalMessage.includes("unknown voice") ||
            paramSignalMessage.includes("unknown field") ||
            paramSignalMessage.includes("unknown parameter") ||
            paramSignalMessage.includes("unsupported");
        if (
            (sampleParam && hasParamSignal) ||
            looksLikeUnsupportedParamMessage(mergedMessage) ||
            paramSignalMessage.includes("unknown voice")
        ) {
            return {
                internalCode: "UPSTREAM_UNSUPPORTED_PARAM",
                param: sampleParam || extractParamFromMessage(mergedMessage),
                path: null,
                keyword: null,
            };
        }
    }

    const topLevelCode = String(
        (body as any)?.error?.code ??
        (body as any)?.code ??
        (body as any)?.error_code ??
        "",
    ).toLowerCase();
    const topLevelMessage = String(
        (body as any)?.error?.message ??
        (body as any)?.message ??
        (body as any)?.description ??
        "",
    );
    if (
        topLevelCode.includes("unsupported_param") ||
        topLevelCode.includes("unsupported_parameter") ||
        looksLikeUnsupportedParamMessage(topLevelMessage)
    ) {
        return {
            internalCode: topLevelCode.includes("combo")
                ? "UPSTREAM_UNSUPPORTED_PARAM_COMBO"
                : "UPSTREAM_UNSUPPORTED_PARAM",
            param: extractParamFromMessage(topLevelMessage),
            path: null,
            keyword: null,
        };
    }

    return null;
}

// Classify errors into user vs system ownership for operations triage.
// system: gateway/provider issues we should act on.
// user: request payload/parameter issues the caller should fix.
export function classifyErrorType(args: {
    stage: "before" | "execute";
    status?: number | null;
    errorCode?: string | null;
    body?: any;
}): "system" | "user" {
    const code = String(args.errorCode ?? "").toLowerCase();
    const status = Number(args.status ?? 0);

    if (code.startsWith("user:")) return "user";
    if (code.startsWith("upstream:")) return "system";

    const userHints = [
        "invalid_json",
        "validation",
        "unsupported_param",
        "unsupported_model_or_endpoint",
        "unsupported_modalities",
        "bad_request",
        "missing_required",
    ];
    if (userHints.some((hint) => code.includes(hint))) return "user";

    // Treat auth/key/rate/upstream failures as system issues per gateway ops policy.
    const systemHints = [
        "gateway",
        "no_key",
        "missing_api_key",
        "provider_key",
        "unauthorized",
        "forbidden",
        "timeout",
        "overload",
        "rate_limit",
        "upstream",
        "internal",
        "executor",
        "routing",
        "breaker",
    ];
    if (systemHints.some((hint) => code.includes(hint))) return "system";

    if (status >= 500) return "system";
    if (status === 429 || status === 408 || status === 401 || status === 403) return "system";
    if (status >= 400) return "user";

    return "system";
}

function hasExecuteUpstreamEvidence(body: any): boolean {
    if (!body || typeof body !== "object") return false;
    if (Array.isArray(body.failure_sample) && body.failure_sample.length > 0) return true;
    if (Array.isArray(body.failed_providers) && body.failed_providers.length > 0) return true;
    if (Array.isArray(body.failed_statuses) && body.failed_statuses.length > 0) return true;
    if (
        body.reason === "all_candidates_failed" ||
        body.reason === "upstream_provider_payment_required"
    ) {
        return true;
    }
    if (typeof body.provider_payment_required_provider === "string") return true;
    if (body.upstream_error && typeof body.upstream_error === "object") return true;
    return false;
}

export function classifyErrorOrigin(args: {
    stage: "before" | "execute";
    status?: number | null;
    errorCode?: string | null;
    body?: any;
}): "upstream" | "gateway" | "user" {
    const code = String(args.errorCode ?? "").toLowerCase();
    const status = Number(args.status ?? 0);

    if (args.stage === "before") {
        if (status >= 500) return "gateway";
        return "user";
    }

    if (code === "upstream_error" || code === "provider_payment_required") {
        return "upstream";
    }
    if (hasExecuteUpstreamEvidence(args.body)) {
        return "upstream";
    }

    if (
        code === "pipeline_execution_error" ||
        code === "before_error" ||
        code.includes("pipeline") ||
        code.includes("gateway") ||
        code.includes("executor")
    ) {
        return "gateway";
    }

    if (status >= 500) return "gateway";
    if (status === 408 || status === 429) return "upstream";
    if (status >= 400) return "user";
    return "gateway";
}

// Helper to safely parse JSON from a Response
export async function safeJson(res: Response): Promise<any> {
    try { return await res.clone().json(); } catch { return {}; }
}

// Main error handler function for before/execute errors
export async function handleError({
    stage,
    res,
    endpoint,
    ctx,
    timingHeader,
    auditFailure,
    req,
}: {
    stage: "before" | "execute",
    res: Response,
    endpoint: Endpoint,
    ctx?: PipelineContext,
    timingHeader?: string,
    auditFailure: (args: any) => Promise<void>,
    req?: Request,
}): Promise<Response> {
    const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
    if (timingHeader) {
        headers.set("Server-Timing", timingHeader);
        headers.set("Timing-Allow-Origin", "*");
    }

    console.log(`Handling ${stage} error for endpoint ${endpoint}: status ${res.status}`);

    const body = await safeJson(res);
    const debugHeader = req?.headers.get("x-gateway-debug");
    const debugRequested = (() => {
        if (!debugHeader) return false;
        const value = debugHeader.toLowerCase();
        return value === "true" || value === "1" || value === "yes";
    })();
    const debugEnabled =
        isDebugAllowed() &&
        ((typeof process !== "undefined" &&
            process.env?.GATEWAY_DEBUG_ERRORS === "1") ||
            debugRequested);
    const errCode = extractErrorCode(body, stage === "before" ? "before_error" : "upstream_error");
    const description = extractErrorDescription(body);
    const upstreamUnsupportedParamSignal = extractUpstreamUnsupportedParamSignal({ stage, body });
    let attribution = classifyAttribution({ stage, status: res.status, errorCode: errCode, body });
    let errorType = classifyErrorType({ stage, status: res.status, errorCode: errCode, body });
    let errorOrigin = classifyErrorOrigin({ stage, status: res.status, errorCode: errCode, body });
    if (upstreamUnsupportedParamSignal) {
        // Unsupported-param failures returned by upstream are generally a gateway/provider
        // capability-mapping issue, not caller behavior.
        attribution = "upstream";
        errorType = "system";
        errorOrigin = "upstream";
    }
    headers.set("X-Gateway-Error-Attribution", attribution);
    headers.set("X-Gateway-Error-Origin", errorOrigin);

    const attributionHeaders = req
        ? readAttributionHeaders(req)
        : {
            referer: null,
            appTitle: null,
            appId: null,
            appName: null,
            sessionId: null,
            userId: null,
        };
    const requestMeta = (() => {
        if (!req) {
            return {
                requestMethod: null,
                requestPath: null,
                requestUrl: null,
                userAgent: null,
                clientIp: null,
                cfRay: null,
                edgeColo: null,
                edgeCity: null,
                edgeCountry: null,
                edgeContinent: null,
                edgeAsn: null,
            };
        }
        const forwardedFor = req.headers.get("x-forwarded-for");
        const clientIp =
            req.headers.get("cf-connecting-ip") ??
            (forwardedFor ? forwardedFor.split(",")[0]?.trim() : null);
        const requestUrl = req.url ?? null;
        const requestPath = (() => {
            try {
                return new URL(req.url).pathname;
            } catch {
                return null;
            }
        })();
        const edge = getEdgeMeta(req);
        return {
            requestMethod: req.method ?? null,
            requestPath,
            requestUrl,
            userAgent: req.headers.get("user-agent"),
            clientIp,
            cfRay: req.headers.get("cf-ray"),
            edgeColo: edge.colo ?? null,
            edgeCity: edge.city ?? null,
            edgeCountry: edge.country ?? null,
            edgeContinent: edge.continent ?? null,
            edgeAsn: edge.asn ?? null,
        };
    })();
    const statusCode = res.status ?? (stage === "before" ? 500 : 502);
    const generationId =
        ctx?.requestId ??
        body?.generation_id ??
        body?.request_id ??
        body?.requestId ??
        "unknown";
    console.log("Gateway error details", {
        stage,
        endpoint,
        requestId: generationId,
        model: ctx?.model ?? body?.model ?? null,
        errorCode: errCode,
        description: description ?? null,
        status: statusCode,
        internalCode: upstreamUnsupportedParamSignal?.internalCode ?? null,
        unsupportedParam: upstreamUnsupportedParamSignal?.param ?? null,
        errorOrigin,
        attribution,
    });
    if (debugEnabled) {
        void logDebugEvent("error.upstream", {
            requestId: generationId,
            endpoint,
            model: ctx?.model ?? body?.model ?? null,
            upstream: body,
        });
    }
    const fallbackDescription =
        description ??
        (typeof body?.error === "string" ? body.error : null) ??
        res.statusText ??
        "An error occurred while processing the request.";
    const errorPayload: Record<string, unknown> = {
        generation_id: generationId,
        status_code: statusCode,
        error: errCode,
        error_type: errorType,
        error_origin: errorOrigin,
        description: fallbackDescription,
    };
    if (
        stage === "execute" &&
        (errCode === "upstream_error" || errCode === "provider_payment_required")
    ) {
        if (typeof body?.reason === "string") errorPayload.reason = body.reason;
        const attemptCount = Number(body?.attempt_count ?? NaN);
        if (Number.isFinite(attemptCount) && attemptCount > 0) {
            errorPayload.attempt_count = attemptCount;
        }
        if (Array.isArray(body?.failed_providers) && body.failed_providers.length > 0) {
            errorPayload.failed_providers = body.failed_providers
                .filter((provider: unknown): provider is string => typeof provider === "string")
                .slice(0, 8);
        }
        if (Array.isArray(body?.failed_statuses) && body.failed_statuses.length > 0) {
            errorPayload.failed_statuses = body.failed_statuses
                .map((status: unknown) => Number(status ?? NaN))
                .filter((status: number) => Number.isFinite(status));
        }
        const failureSample = toExecuteFailureSample(body?.failure_sample);
        if (failureSample) {
            errorPayload.failure_sample = failureSample;
            const first = failureSample[0];
            errorPayload.upstream_error = {
                code: first?.upstream_error_code ?? null,
                message: first?.upstream_error_message ?? null,
                description: first?.upstream_error_description ?? null,
                param: first?.upstream_error_param ?? null,
            };
        }
        if (typeof body?.provider_payment_required_provider === "string") {
            errorPayload.provider_payment_required_provider = body.provider_payment_required_provider;
        }
        if (typeof body?.provider_payment_required_support_notice === "string") {
            errorPayload.provider_payment_required_support_notice =
                body.provider_payment_required_support_notice;
        }
    }
    if (errCode === "validation_error" && Array.isArray(body?.details)) {
        errorPayload.details = body.details;
    }
    if (errCode === "unsupported_model_or_endpoint") {
        if (typeof body?.reason === "string" && body.reason.trim().length > 0) {
            errorPayload.reason = body.reason;
        }
        if (body?.provider_candidate_diagnostics && typeof body.provider_candidate_diagnostics === "object") {
            errorPayload.provider_candidate_diagnostics = body.provider_candidate_diagnostics;
        }
        if (body?.provider_enablement && typeof body.provider_enablement === "object") {
            errorPayload.provider_enablement = body.provider_enablement;
        }
        if (Array.isArray(body?.missing_pricing_providers) && body.missing_pricing_providers.length > 0) {
            errorPayload.missing_pricing_providers = body.missing_pricing_providers
                .filter((provider: unknown): provider is string => typeof provider === "string")
                .slice(0, 16);
        }
    }
    if (body?.routing_diagnostics && typeof body.routing_diagnostics === "object") {
        errorPayload.routing_diagnostics = body.routing_diagnostics;
    }
    if (body?.provider_failure_diagnostics && typeof body.provider_failure_diagnostics === "object") {
        errorPayload.provider_failure_diagnostics = body.provider_failure_diagnostics;
    }
    if (debugEnabled) {
        const routingDebug = ctx
            ? {
                requested_params: sanitizeForAxiom(ctx.requestedParams ?? null),
                param_routing_diagnostics: sanitizeForAxiom(ctx.paramRoutingDiagnostics ?? null),
                provider_enablement_diagnostics: sanitizeForAxiom(
                    ctx.providerEnablementDiagnostics ?? null,
                ),
                provider_candidate_build_diagnostics: sanitizeForAxiom(
                    ctx.providerCandidateBuildDiagnostics ?? null,
                ),
                routing_snapshot: sanitizeForAxiom((ctx as any)?.routingSnapshot ?? null),
                routing_diagnostics: sanitizeForAxiom((ctx as any)?.routingDiagnostics ?? null),
            }
            : null;

        errorPayload.debug = {
            upstream: body,
            provider_attempts: redactErrorValue(ctx?.providerAttempts ?? null),
            attempt_errors: redactErrorValue((ctx as any)?.attemptErrors ?? null),
            routing: routingDebug,
        };
    }
    const gatewayErrorPayload = sanitizeForAxiom(errorPayload);
    const providerResponseHeaders = sanitizeForAxiom(headersToRecord(res.headers));
    const replayRequestPayload = ctx?.rawBody ?? ctx?.body ?? null;

    // Audit failure
    const auditExtraJson = (() => {
        try {
            return stringifyForAxiom({
                stage,
                request: requestMeta,
                timing: ctx ? (ctx as any)?.timing ?? null : body?.timing ?? null,
                providers: ctx?.providers?.map((p) => ({
                    provider_id: p.providerId,
                    base_weight: p.baseWeight,
                    byok_keys: p.byokMeta?.length ?? 0,
                    has_pricing: Boolean(p.pricingCard),
                })),
                transform: {
                    protocol: ctx?.protocol ?? null,
                    endpoint,
                    model: ctx?.model ?? body?.model ?? null,
                    request_surface_sanitized: sanitizeForAxiom(ctx?.rawBody ?? ctx?.body ?? null),
                    gateway_response_sanitized: gatewayErrorPayload,
                    gateway_response_present: true,
                    upstream_request_sanitized: null,
                    upstream_response_sanitized: sanitizeForAxiom(body ?? null),
                    upstream_response_present: body != null,
                    upstream_response_headers: providerResponseHeaders,
                    upstream_status_code: statusCode,
                    upstream_status_text: res.statusText ?? null,
                    upstream_url: res.url ?? null,
                    requested_params: sanitizeForAxiom(ctx?.requestedParams ?? null),
                    param_routing_diagnostics: sanitizeForAxiom(ctx?.paramRoutingDiagnostics ?? null),
                    provider_enablement_diagnostics: sanitizeForAxiom(ctx?.providerEnablementDiagnostics ?? null),
                    provider_candidate_build_diagnostics: sanitizeForAxiom(
                        ctx?.providerCandidateBuildDiagnostics ?? null,
                    ),
                    provider_attempts: sanitizeForAxiom(ctx?.providerAttempts ?? null),
                    attempt_errors: sanitizeForAxiom((ctx as any)?.attemptErrors ?? null),
                    routing_snapshot: sanitizeForAxiom((ctx as any)?.routingSnapshot ?? null),
                    routing_diagnostics: sanitizeForAxiom((ctx as any)?.routingDiagnostics ?? null),
                    error_details: sanitizeForAxiom(body ?? null),
                },
                gateway_response_sanitized: gatewayErrorPayload,
                provider_response_sanitized: sanitizeForAxiom(body ?? null),
                internal_reporting: sanitizeForAxiom(upstreamUnsupportedParamSignal ?? null),
            });
        } catch {
            return null;
        }
    })();
    const errorDetailsJson = buildErrorDetails(body, ctx);
    const internalLatencyMs = ctx ? (ctx as any)?.timing?.internal_latency_ms ?? null : null;
    const beforeTimingMs = (() => {
        if (!ctx) return null;
        const fromMeta = (ctx as any)?.meta?.before_ms;
        if (typeof fromMeta === "number" && Number.isFinite(fromMeta)) return fromMeta;
        const nested = (ctx as any)?.timing?.before?.total_ms;
        if (typeof nested === "number" && Number.isFinite(nested)) return nested;
        const flat = (ctx as any)?.timing?.before_start;
        return typeof flat === "number" && Number.isFinite(flat) ? flat : null;
    })();
    const executeTimingMs = (() => {
        if (!ctx) return null;
        const nested = (ctx as any)?.timing?.execute?.total_ms;
        if (typeof nested === "number" && Number.isFinite(nested)) return nested;
        const flat = (ctx as any)?.timing?.adapter_start;
        return typeof flat === "number" && Number.isFinite(flat) ? flat : null;
    })();
    const executeAdapterMs = (() => {
        if (!ctx) return null;
        const nested = (ctx as any)?.timing?.execute?.adapter_ms;
        if (typeof nested === "number" && Number.isFinite(nested)) return nested;
        const flat = (ctx as any)?.timing?.adapter_roundtrip_ms;
        return typeof flat === "number" && Number.isFinite(flat) ? flat : null;
    })();
    const providerFromAttempts = (() => {
        const attempts = ctx ? (ctx as any)?.attemptErrors : null;
        if (Array.isArray(attempts) && attempts.length > 0) {
            const last = attempts[attempts.length - 1];
            if (last && typeof last === "object" && "provider" in last) {
                return (last as any).provider ?? null;
            }
        }
        return null;
    })();
    const providerForAudit = providerFromAttempts ?? ctx?.providers?.[0]?.providerId ?? null;
    const auditArgs: any = {
        stage,
        requestId: ctx?.requestId ?? body?.request_id ?? "unknown",
        workspaceId: ctx?.workspaceId ?? body?.workspace_id ?? null,
        endpoint,
        model: ctx?.model ?? body?.model,
        appTitle: ctx?.meta?.appTitle ?? body?.meta?.appTitle ?? attributionHeaders.appTitle ?? null,
        referer: ctx?.meta?.referer ?? body?.meta?.referer ?? attributionHeaders.referer ?? null,
        appId: ctx?.meta?.appId ?? body?.meta?.appId ?? attributionHeaders.appId ?? null,
        appName: ctx?.meta?.appName ?? body?.meta?.appName ?? attributionHeaders.appName ?? null,
        authMethod: ctx?.meta?.authMethod ?? "api_key",
        oauthClientId: ctx?.meta?.oauthClientId ?? null,
        oauthUserId: ctx?.meta?.oauthUserId ?? null,
        requestUserId:
            ctx?.meta?.requestUserId ??
            (typeof body?.user === "string" ? body.user : null) ??
            attributionHeaders.userId ??
            null,
        sessionId:
            ctx?.meta?.sessionId ??
            (isBodyOnlyTextSessionEndpoint(endpoint)
                ? normalizeTextBodySessionId(body?.session_id)
                : normalizeBoundedString(
                    body?.session_id ?? body?.sessionId ?? attributionHeaders.sessionId,
                    128,
                )) ??
            null,
        traceData:
            ctx?.meta?.trace ??
            (body?.trace && typeof body.trace === "object" && !Array.isArray(body.trace)
                ? body.trace
                : null),
        statusCode,
        errorCode: `${attribution}:${errCode}`,
        errorMessage: description ?? fallbackDescription,
        before: ctx ? (ctx as any)?.timing?.before ?? null : body?.timing?.before ?? null,
        execute: ctx ? (ctx as any)?.timing?.execute ?? null : null,
        latencyMs: ctx
            ? Math.round((beforeTimingMs ?? 0) + (executeTimingMs ?? 0))
            : (body?.timing?.before?.total_ms ? Math.round(body.timing.before.total_ms) : null),
        generationMs: ctx ? (executeAdapterMs ? Math.round(executeAdapterMs) : null) : null,
        internalLatencyMs,
        byok: ctx ? ((ctx as any)?.meta?.keySource === "byok") : false,
        keyId: ctx?.meta?.apiKeyId ?? null,
        requestMethod: requestMeta.requestMethod,
        requestPath: requestMeta.requestPath,
        requestUrl: requestMeta.requestUrl,
        userAgent: requestMeta.userAgent,
        clientIp: requestMeta.clientIp,
        cfRay: requestMeta.cfRay,
        edgeColo: requestMeta.edgeColo,
        edgeCity: requestMeta.edgeCity,
        edgeCountry: requestMeta.edgeCountry,
        edgeContinent: requestMeta.edgeContinent,
        edgeAsn: requestMeta.edgeAsn,
        extraJson: auditExtraJson,
        errorDetailsJson,
        errorPayload: gatewayErrorPayload,
        requestPayload: replayRequestPayload,
        gatewayResponse: errorPayload,
        providerResponse: body ?? null,
        detailMetadata: {
            stage,
            replay_supported: Boolean(
                replayRequestPayload &&
                    typeof replayRequestPayload === "object"
            ),
        },
        requestedModel:
            ctx?.requestedModel ??
            (typeof body?.model === "string" ? body.model : null) ??
            ctx?.model ??
            null,
    };
    if (stage === "execute") {
        auditArgs.stream = ctx?.stream;
        auditArgs.provider = providerForAudit;
        auditArgs.providerAttempts = Array.isArray(ctx?.providerAttempts)
            ? ctx.providerAttempts
            : null;
    }
    try {
        await auditFailure(auditArgs);
    } catch (auditErr) {
        console.error("[audit] failure audit insert failed", auditErr);
    }
    try {
        await emitGatewayRequestEvent({
        ctx,
        result: undefined,
        requestId: auditArgs.requestId,
        workspaceId: auditArgs.workspaceId ?? "unknown",
        endpoint,
        model: ctx?.model ?? body?.model ?? null,
        provider: stage === "execute" ? providerForAudit : null,
        appTitle: ctx?.meta?.appTitle ?? body?.meta?.appTitle ?? attributionHeaders.appTitle ?? null,
        referer: ctx?.meta?.referer ?? body?.meta?.referer ?? attributionHeaders.referer ?? null,
        requestMethod: requestMeta.requestMethod,
        requestPath: requestMeta.requestPath,
        requestUrl: requestMeta.requestUrl,
        userAgent: requestMeta.userAgent,
        clientIp: requestMeta.clientIp,
        cfRay: requestMeta.cfRay,
        edgeColo: requestMeta.edgeColo,
        edgeCity: requestMeta.edgeCity,
        edgeCountry: requestMeta.edgeCountry,
        edgeContinent: requestMeta.edgeContinent,
        edgeAsn: requestMeta.edgeAsn,
        keyId: ctx?.meta?.apiKeyId ?? null,
        statusCode,
        success: false,
        errorCode: `${attribution}:${errCode}`,
        errorMessage: description ?? fallbackDescription,
        errorType,
        errorStage: stage,
        internalReason:
            (typeof body?.reason === "string" && body.reason) ||
            (typeof body?.error === "string" && body.error) ||
            errCode,
        internalCode: upstreamUnsupportedParamSignal?.internalCode ?? null,
        unsupportedParam: upstreamUnsupportedParamSignal?.param ?? null,
        unsupportedParamPath: upstreamUnsupportedParamSignal?.path ?? null,
        errorDetails: body,
        providerResponse: body,
        providerResponseHeaders: headersToRecord(res.headers),
        gatewayResponse: errorPayload,
    });
    } catch (eventErr) {
        console.error("[observability] emitGatewayRequestEvent failed", eventErr);
    }
    return new Response(JSON.stringify(errorPayload), { status: statusCode, headers });
}











