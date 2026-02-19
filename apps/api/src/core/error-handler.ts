// src/lib/gateway/error-handler.ts
// Purpose: Normalize errors into gateway responses and emit audits/metrics.
// Why: Centralizes error handling for consistent client behavior.
// How: Parses upstream errors, builds payloads, sets headers, and triggers audits.

import type { Endpoint } from "./types";
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

function buildErrorDetails(body: unknown, ctx?: PipelineContext) {
    const attemptErrors = ctx ? (ctx as any).attemptErrors ?? null : null;
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
                upstream_payload_preview: e.upstream_payload_preview ?? null,
            };
        })
        : attemptErrors;
    const details = {
        upstream_error: redactErrorValue(body ?? null),
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
    if (upstreamUnsupportedParamSignal) {
        // Unsupported-param failures returned by upstream are generally a gateway/provider
        // capability-mapping issue, not caller behavior.
        attribution = "upstream";
        errorType = "system";
    }
    headers.set("X-Gateway-Error-Attribution", attribution);

    const attributionHeaders = req ? readAttributionHeaders(req) : { referer: null, appTitle: null };
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
        description: fallbackDescription,
    };
    if (errCode === "validation_error" && Array.isArray(body?.details)) {
        errorPayload.details = body.details;
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
            attempt_errors: redactErrorValue((ctx as any)?.attemptErrors ?? null),
            routing: routingDebug,
        };
    }

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
                    requested_params: sanitizeForAxiom(ctx?.requestedParams ?? null),
                    param_routing_diagnostics: sanitizeForAxiom(ctx?.paramRoutingDiagnostics ?? null),
                },
                internal_reporting: sanitizeForAxiom(upstreamUnsupportedParamSignal ?? null),
            });
        } catch {
            return null;
        }
    })();
    const errorDetailsJson = buildErrorDetails(body, ctx);
    const internalLatencyMs = ctx ? (ctx as any)?.timing?.internal_latency_ms ?? null : null;
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
        teamId: ctx?.teamId ?? body?.team_id ?? null,
        endpoint,
        model: ctx?.model ?? body?.model,
        appTitle: ctx?.meta?.appTitle ?? body?.meta?.appTitle ?? attributionHeaders.appTitle ?? null,
        referer: ctx?.meta?.referer ?? body?.meta?.referer ?? attributionHeaders.referer ?? null,
        statusCode,
        errorCode: `${attribution}:${errCode}`,
        errorMessage: description ?? fallbackDescription,
        before: ctx ? (ctx as any)?.timing?.before ?? null : body?.timing?.before ?? null,
        execute: ctx ? (ctx as any)?.timing?.execute ?? null : null,
        latencyMs: ctx ? Math.round(((ctx as any)?.timing?.before?.total_ms ?? 0) + ((ctx as any)?.timing?.execute?.total_ms ?? 0)) : (body?.timing?.before?.total_ms ? Math.round(body.timing.before.total_ms) : null),
        generationMs: ctx ? ((ctx as any)?.timing?.execute?.adapter_ms ? Math.round((ctx as any).timing.execute.adapter_ms) : null) : null,
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
    };
    if (stage === "execute") {
        auditArgs.stream = ctx?.stream;
        auditArgs.provider = providerForAudit;
    }
    await auditFailure(auditArgs);
    await emitGatewayRequestEvent({
        ctx,
        result: undefined,
        requestId: auditArgs.requestId,
        teamId: auditArgs.teamId ?? "unknown",
        endpoint,
        model: ctx?.model ?? body?.model ?? null,
        statusCode,
        success: false,
        errorCode: `${attribution}:${errCode}`,
        errorMessage: description ?? fallbackDescription,
        errorType,
        errorStage: stage,
        internalReason: errCode,
        internalCode: upstreamUnsupportedParamSignal?.internalCode ?? null,
        unsupportedParam: upstreamUnsupportedParamSignal?.param ?? null,
        unsupportedParamPath: upstreamUnsupportedParamSignal?.path ?? null,
        errorDetails: body,
    });
    return new Response(JSON.stringify(errorPayload), { status: statusCode, headers });
}











