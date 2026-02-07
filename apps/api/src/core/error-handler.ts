// src/lib/gateway/error-handler.ts
// Purpose: Normalize errors into gateway responses and emit audits/metrics.
// Why: Centralizes error handling for consistent client behavior.
// How: Parses upstream errors, builds payloads, sets headers, and triggers audits.

import type { Endpoint } from "./types";
import type { PipelineContext } from "@pipeline/before/types";
import { isDebugAllowed, logDebugEvent } from "@pipeline/debug";
import { readAttributionHeaders } from "@pipeline/after/attribution";
import { getEdgeMeta } from "./edge";

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
                provider: e.provider ?? null,
                endpoint: e.endpoint ?? null,
                type: e.type ?? e.reason ?? null,
                reason: e.reason ?? null,
                message: e.message ?? null,
                status: e.status ?? null,
                code: e.code ?? null,
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
    if (stage === "before") return "user";
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
    const attribution = classifyAttribution({ stage, status: res.status, errorCode: errCode, body });
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
        description: fallbackDescription,
    };
    if (errCode === "validation_error" && Array.isArray(body?.details)) {
        errorPayload.details = body.details;
    }
    if (debugEnabled) {
        errorPayload.debug = {
            upstream: body,
        };
    }

    // Audit failure
    const auditExtraJson = (() => {
        try {
            return JSON.stringify({
                stage,
                request: requestMeta,
                timing: ctx ? (ctx as any)?.timing ?? null : body?.timing ?? null,
                providers: ctx?.providers?.map((p) => ({
                    provider_id: p.providerId,
                    base_weight: p.baseWeight,
                    byok_keys: p.byokMeta?.length ?? 0,
                    has_pricing: Boolean(p.pricingCard),
                })),
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
    return new Response(JSON.stringify(errorPayload), { status: statusCode, headers });
}











