// src/lib/gateway/audit/index.ts
// Purpose: Persist audits and send analytics events.
// Why: Ensures observability for every request.
// How: Builds audit rows and ships them to Supabase/Axiom with retries.

import { getBindings, getSupabaseAdmin, ensureRuntimeForBackground } from "@/runtime/env";
import { sendAxiomEvent } from "./axiom";
import { ensureAppId } from "../after/apps";
import { normalizeFinishReason } from "./normalize-finish-reason";
import type { Endpoint } from "@core/types";

function supaAdmin() {
    return getSupabaseAdmin();
}

const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 250;
const AXIOM_RETRY_ATTEMPTS = 1;
const AXIOM_RETRY_DELAY_MS = 0;
const AXIOM_LOG_THROTTLE_MS = 60_000;
const axiomLogThrottle = new Map<string, number>();

async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryWithBackoff<T>(fn: () => Promise<T>, label: string, attempts = DEFAULT_RETRY_ATTEMPTS, delayMs = DEFAULT_RETRY_DELAY_MS): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            if (i < attempts - 1) {
                await sleep(delayMs * (i + 1));
            }
        }
    }
    const finalErr = lastErr instanceof Error ? lastErr : new Error(typeof lastErr === "string" ? lastErr : "unknown_error");
    finalErr.message = `${label}: ${finalErr.message}`;
    throw finalErr;
}

async function insertGatewayRequest(row: any) {
    const client = supaAdmin();
    const { error } = await client.from("gateway_requests").insert(row);
    if (error) {
        const err = new Error(`[audit] insert gateway_requests error: ${error?.message ?? "unknown"}`);
        (err as any).cause = error;
        throw err;
    }
}

function buildSupaRow(args: {
    requestId: string; teamId?: string | null;
    endpoint: Endpoint; model?: string | null; provider?: string | null;
    stream?: boolean; byok?: boolean;
    nativeResponseId?: string | null;
    statusCode?: number | null; success: boolean;
    errorCode?: string | null; errorMessage?: string | null;
    appId?: string | null; keyId?: string | null;
    latencyMs?: number | null; generationMs?: number | null;
    usage?: any | null; costNanos?: number | null; currency?: string | null;
    pricingLines?: any[] | null; throughput?: number | null;
    finishReason?: string | null;
    edgeColo?: string | null;
    edgeCity?: string | null;
    edgeCountry?: string | null;
    edgeContinent?: string | null;
    edgeAsn?: number | null;
}) {
    return {
        request_id: args.requestId,
        team_id: args.teamId ?? null,
        app_id: args.appId ?? null,
        endpoint: args.endpoint,
        model_id: args.model ?? null,
        provider: args.provider ?? null,
        native_response_id: args.nativeResponseId ?? null,
        stream: !!args.stream,
        byok: !!args.byok,
        status_code: args.statusCode ?? null,
        success: !!args.success,
        error_code: args.errorCode ?? null,
        error_message: args.errorMessage ?? null,
        latency_ms: args.latencyMs ?? null,
        generation_ms: args.generationMs ?? null,
        usage: args.usage ?? {},
        ...(args.costNanos != null ? { cost_nanos: Math.round(args.costNanos as number) } : {}),
        currency: args.currency ?? null,
        pricing_lines: Array.isArray(args.pricingLines) ? args.pricingLines : [],
        key_id: args.keyId ?? null,
        throughput: args.throughput ?? null,
        finish_reason: args.finishReason ?? null,
        location: args.edgeColo ?? null,
    };
}

// Strip nested pricing object from usage before storing in DB to avoid duplicating
// detailed pricing lines (which are stored separately in pricing_lines).
function stripPricingFromUsage(usage: any): any {
    if (!usage || typeof usage !== 'object') return usage;
    const { pricing: _omit, ...rest } = usage;
    return rest;
}

function formatAxiomError(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err;
    return "unknown_error";
}

function logAxiomNonBlocking(label: string, err: unknown) {
    const message = formatAxiomError(err);
    // Remove volatile requestId suffixes to keep throttling effective.
    const normalized = message.replace(/requestId\s+[A-Za-z0-9_\-]+/g, "requestId <redacted>");
    const key = `${label}:${normalized}`;
    const now = Date.now();
    const last = axiomLogThrottle.get(key) ?? 0;
    if (now - last < AXIOM_LOG_THROTTLE_MS) return;
    axiomLogThrottle.set(key, now);
    console.warn(`[audit] Axiom ingest failed (non-blocking): ${normalized}`);
}

function classifyAuditErrorType(errorCode: string | null | undefined, statusCode: number | null | undefined): "system" | "user" {
    const code = String(errorCode ?? "").toLowerCase();
    const raw = code.includes(":") ? code.split(":").slice(1).join(":") : code;
    const status = Number(statusCode ?? 0);

    const userHints = ["validation", "invalid_json", "unsupported_param", "unsupported_model_or_endpoint", "unsupported_modalities"];
    const systemHints = [
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
    if (systemHints.some((hint) => raw.includes(hint))) return "system";
    if (userHints.some((hint) => raw.includes(hint))) return "user";

    if (code.startsWith("user:")) return "user";
    if (code.startsWith("upstream:")) return "system";

    if (status >= 500) return "system";
    if (status === 429 || status === 408 || status === 401 || status === 403) return "system";
    if (status >= 400) return "user";
    return "system";
}

export async function auditSuccess(args: {
    requestId: string; teamId: string;
    provider: string; model: string; endpoint: Endpoint;
    stream: boolean; byok: boolean;
    nativeResponseId?: string | null;
    appTitle?: string | null; referer?: string | null;
    requestMethod?: string | null;
    requestPath?: string | null;
    requestUrl?: string | null;
    userAgent?: string | null;
    clientIp?: string | null;
    cfRay?: string | null;
    edgeColo?: string | null;
    edgeCity?: string | null;
    edgeCountry?: string | null;
    edgeContinent?: string | null;
    edgeAsn?: number | null;
    generationMs?: number | null; latencyMs?: number | null;
    internalLatencyMs?: number | null;
    usagePriced: any; totalCents: number; totalNanos?: number | null; currency: "USD" | string;
    finishReason?: string | null;
    statusCode: number; throughput?: number | null; keyId?: string | null;
    extraJson?: string | null;
    // Wide event enrichment
    teamEnrichment?: any | null;
    keyEnrichment?: any | null;
    requestEnrichment?: any | null;
    routingContext?: any | null;
}) {
    const releaseRuntime = ensureRuntimeForBackground();
    try {
        const bindings = getBindings();
        const pricingLines = args.usagePriced?.pricing?.lines ?? [];
        const strippedUsage = stripPricingFromUsage(args.usagePriced);
        const appId = await ensureAppId({ teamId: args.teamId, appTitle: args.appTitle ?? null, referer: args.referer ?? null });
        const row = buildSupaRow({
            requestId: args.requestId,
            teamId: args.teamId,
            endpoint: args.endpoint,
            model: args.model,
            provider: args.provider,
            stream: args.stream,
            byok: args.byok,
            nativeResponseId: args.nativeResponseId ?? null,
            statusCode: args.statusCode,
            success: true,
            errorCode: null,
            errorMessage: null,
            appId,
            keyId: args.keyId ?? null,
            latencyMs: args.latencyMs ?? null,
            generationMs: args.generationMs ?? null,
            usage: strippedUsage ?? {},
            costNanos: args.totalNanos ?? (Number.isFinite(args.totalCents) ? Math.round((args.totalCents as number) * 1e7) : null),
            currency: args.currency,
            pricingLines,
            throughput: args.throughput ?? null,
            edgeColo: args.edgeColo ?? null,
            edgeCity: args.edgeCity ?? null,
            edgeCountry: args.edgeCountry ?? null,
            edgeContinent: args.edgeContinent ?? null,
            edgeAsn: args.edgeAsn ?? null,
            finishReason: args.finishReason ?? null,
        });

        let supabaseError: Error | null = null;
        try {
            await retryWithBackoff(() => insertGatewayRequest(row), "supabase_audit_success_insert");
        } catch (err) {
            supabaseError = err instanceof Error ? err : new Error(String(err));
        }

        try {
            await retryWithBackoff(() => sendAxiomEvent({
                requestId: args.requestId,
                teamId: args.teamId,
                keyId: args.keyId ?? null,
                provider: args.provider,
                model: args.model,
                endpoint: args.endpoint,
                stream: args.stream,
                isByok: args.byok,
                stage: "execute",
                appTitle: args.appTitle ?? null,
                referer: args.referer ?? null,
                requestMethod: args.requestMethod ?? null,
                requestPath: args.requestPath ?? null,
                requestUrl: args.requestUrl ?? null,
                userAgent: args.userAgent ?? null,
                clientIp: args.clientIp ?? null,
                cfRay: args.cfRay ?? null,
                edgeColo: args.edgeColo ?? null,
                edgeCity: args.edgeCity ?? null,
                edgeCountry: args.edgeCountry ?? null,
                edgeContinent: args.edgeContinent ?? null,
                edgeAsn: args.edgeAsn ?? null,
                nativeResponseId: args.nativeResponseId ?? null,
                statusCode: args.statusCode,
                success: true,
                errorCode: null,
                errorMessage: null,
                errorType: null,
                generationMs: args.generationMs ?? null,
                latencyMs: args.latencyMs ?? null,
                internalLatencyMs: args.internalLatencyMs ?? null,
                throughput: args.throughput ?? null,
                usage: strippedUsage ?? null,
                pricing: {
                    total_cents: args.totalCents,
                    total_nanos: args.usagePriced?.pricing?.total_nanos ?? null,
                    total_usd_str: args.usagePriced?.pricing?.total_usd_str ?? null,
                    currency: args.currency,
                    lines_json: JSON.stringify(pricingLines),
                    lines: pricingLines,
                },
                finishReason: args.finishReason ?? null,
                env: bindings.NODE_ENV ?? null,
                apiVersion: bindings.NEXT_PUBLIC_GATEWAY_VERSION ?? null,
                extraJson: args.extraJson ?? null,
                // Wide event enrichment (loggingsucks.com pattern)
                teamEnrichment: args.teamEnrichment ?? null,
                keyEnrichment: args.keyEnrichment ?? null,
                requestEnrichment: args.requestEnrichment ?? null,
                routingContext: args.routingContext ?? null,
            }), "axiom_audit_success_ingest", AXIOM_RETRY_ATTEMPTS, AXIOM_RETRY_DELAY_MS);
        } catch (err) {
            logAxiomNonBlocking("axiom_audit_success_ingest", err);
        }

        if (supabaseError) throw supabaseError;
    } finally {
        releaseRuntime();
    }
}

/** FAILURE AUDIT -- single function with discriminated union */
type AuditFailureBefore = {
    stage: "before";
    requestId: string;
    teamId?: string | null;
    endpoint: Endpoint;
    model?: string | null;
    statusCode: number;
    errorCode: string;
    errorMessage?: string | null;
    latencyMs?: number | null;
    internalLatencyMs?: number | null;
    keyId?: string | null;
    appTitle?: string | null;
    referer?: string | null;
    requestMethod?: string | null;
    requestPath?: string | null;
    requestUrl?: string | null;
    userAgent?: string | null;
    clientIp?: string | null;
    cfRay?: string | null;
    edgeColo?: string | null;
    edgeCity?: string | null;
    edgeCountry?: string | null;
    edgeContinent?: string | null;
    edgeAsn?: number | null;
    extraJson?: string | null;
};
type AuditFailureExecute = {
    stage: "execute";
    requestId: string;
    teamId: string;
    endpoint: Endpoint;
    model: string;
    provider?: string | null;
    stream: boolean;
    statusCode: number;
    errorCode: string;
    errorMessage?: string | null;
    latencyMs?: number | null;
    generationMs?: number | null;
    internalLatencyMs?: number | null;
    byok?: boolean;
    keyId?: string | null;
    appTitle?: string | null;
    referer?: string | null;
    requestMethod?: string | null;
    requestPath?: string | null;
    requestUrl?: string | null;
    userAgent?: string | null;
    clientIp?: string | null;
    cfRay?: string | null;
    edgeColo?: string | null;
    edgeCity?: string | null;
    edgeCountry?: string | null;
    edgeContinent?: string | null;
    edgeAsn?: number | null;
    extraJson?: string | null;
};

export async function auditFailure(args: AuditFailureBefore | AuditFailureExecute) {
    const releaseRuntime = ensureRuntimeForBackground();
    try {
        const bindings = getBindings();
        const runSupabase = async (row: any, label: string) => {
            await retryWithBackoff(() => insertGatewayRequest(row), label);
        };
        const runAxiom = async (payload: Parameters<typeof sendAxiomEvent>[0], label: string) => {
            try {
                await retryWithBackoff(() => sendAxiomEvent(payload), label, AXIOM_RETRY_ATTEMPTS, AXIOM_RETRY_DELAY_MS);
            } catch (err) {
                logAxiomNonBlocking(label, err);
            }
        };

        if (args.stage === "before") {
            const row = buildSupaRow({
                requestId: args.requestId,
                teamId: args.teamId ?? null,
                endpoint: args.endpoint,
                model: args.model ?? null,
                provider: null,
                stream: false,
                byok: false,
                nativeResponseId: null,
                statusCode: args.statusCode,
                success: false,
                errorCode: args.errorCode,
            errorMessage: args.errorMessage ?? null,
            latencyMs: args.latencyMs ?? null,
            generationMs: null,
            usage: {},
            currency: null,
            pricingLines: [],
            keyId: args.keyId ?? null,
            edgeColo: args.edgeColo ?? null,
            edgeCity: args.edgeCity ?? null,
            edgeCountry: args.edgeCountry ?? null,
            edgeContinent: args.edgeContinent ?? null,
            edgeAsn: args.edgeAsn ?? null,
        });

            let supabaseError: Error | null = null;
            if (args.teamId) {
                try {
                    await runSupabase(row, "supabase_audit_failure_before_insert");
                } catch (err) {
                    supabaseError = err instanceof Error ? err : new Error(String(err));
                }
            }

            await runAxiom({
                requestId: args.requestId,
                teamId: args.teamId ?? 'unknown',
                provider: "unknown",
                model: args.model ?? "unknown",
                endpoint: args.endpoint,
                stream: false,
                isByok: false,
                stage: "before",
                appTitle: args.appTitle ?? null,
                referer: args.referer ?? null,
                requestMethod: args.requestMethod ?? null,
                requestPath: args.requestPath ?? null,
                requestUrl: args.requestUrl ?? null,
                userAgent: args.userAgent ?? null,
                clientIp: args.clientIp ?? null,
                cfRay: args.cfRay ?? null,
                edgeColo: args.edgeColo ?? null,
                edgeCity: args.edgeCity ?? null,
                edgeCountry: args.edgeCountry ?? null,
                edgeContinent: args.edgeContinent ?? null,
                edgeAsn: args.edgeAsn ?? null,
                nativeResponseId: null,
                statusCode: args.statusCode,
                success: false,
                errorCode: args.errorCode,
                errorMessage: args.errorMessage ?? null,
                errorType: classifyAuditErrorType(args.errorCode, args.statusCode),
                generationMs: null,
                latencyMs: args.latencyMs ?? null,
                internalLatencyMs: args.internalLatencyMs ?? null,
                throughput: null,
                usage: null,
                pricing: null,
                finishReason: null,
                env: bindings.NODE_ENV ?? null,
                apiVersion: bindings.NEXT_PUBLIC_GATEWAY_VERSION ?? null,
                extraJson: args.extraJson ?? null,
            }, "axiom_audit_failure_before_ingest");

            if (supabaseError) throw supabaseError;
            return;
        }

        // stage === "execute"
        const row = buildSupaRow({
            requestId: args.requestId,
            teamId: args.teamId,
            endpoint: args.endpoint,
            model: args.model,
            provider: args.provider ?? null,
            stream: !!args.stream,
            byok: !!args.byok,
            nativeResponseId: null,
            statusCode: args.statusCode,
            success: false,
            errorCode: args.errorCode,
            errorMessage: args.errorMessage ?? null,
            latencyMs: args.latencyMs ?? null,
            generationMs: args.generationMs ?? null,
            usage: {},
            currency: null,
            pricingLines: [],
            keyId: args.keyId ?? null,
            edgeColo: args.edgeColo ?? null,
            edgeCity: args.edgeCity ?? null,
            edgeCountry: args.edgeCountry ?? null,
            edgeContinent: args.edgeContinent ?? null,
            edgeAsn: args.edgeAsn ?? null,
        });

        let supabaseError: Error | null = null;
        if (args.teamId) {
            try {
                await runSupabase(row, "supabase_audit_failure_execute_insert");
            } catch (err) {
                supabaseError = err instanceof Error ? err : new Error(String(err));
            }
        }

        await runAxiom({
            requestId: args.requestId,
            teamId: args.teamId,
            provider: args.provider ?? "unknown",
            model: args.model,
            endpoint: args.endpoint,
            stream: !!args.stream,
            isByok: !!args.byok,
            stage: "execute",
            appTitle: args.appTitle ?? null,
            referer: args.referer ?? null,
            requestMethod: args.requestMethod ?? null,
            requestPath: args.requestPath ?? null,
            requestUrl: args.requestUrl ?? null,
            userAgent: args.userAgent ?? null,
            clientIp: args.clientIp ?? null,
            cfRay: args.cfRay ?? null,
            edgeColo: args.edgeColo ?? null,
            edgeCity: args.edgeCity ?? null,
            edgeCountry: args.edgeCountry ?? null,
            edgeContinent: args.edgeContinent ?? null,
            edgeAsn: args.edgeAsn ?? null,
            nativeResponseId: null,
            statusCode: args.statusCode,
            success: false,
            errorCode: args.errorCode,
            errorMessage: args.errorMessage ?? null,
            errorType: classifyAuditErrorType(args.errorCode, args.statusCode),
            generationMs: args.generationMs ?? null,
            latencyMs: args.latencyMs ?? null,
            internalLatencyMs: args.internalLatencyMs ?? null,
            throughput: null,
            usage: null,
            pricing: null,
            finishReason: null,
            env: bindings.NODE_ENV ?? null,
            apiVersion: bindings.NEXT_PUBLIC_GATEWAY_VERSION ?? null,
            extraJson: args.extraJson ?? null,
        }, "axiom_audit_failure_execute_ingest");

        if (supabaseError) throw supabaseError;
    } finally {
        releaseRuntime();
    }
}










