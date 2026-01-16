// src/lib/gateway/audit/index.ts
import { getBindings, getSupabaseAdmin, ensureRuntimeForBackground } from "@/runtime/env";
import { sendAxiomEvent } from "./axiom";
import { ensureAppId } from "../after/apps";
import type { Endpoint } from "@core/types";

function supaAdmin() {
    return getSupabaseAdmin();
}

const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 250;

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

async function upsertGatewayRequest(row: any) {
    const client = supaAdmin();
    const { error } = await client.from("gateway_requests").upsert(row, { onConflict: "team_id,request_id" });
    if (error) {
        const err = new Error(`[audit] upsert gateway_requests error: ${error?.message ?? "unknown"}`);
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
    };
}

// Strip nested pricing object from usage before storing in DB to avoid duplicating
// detailed pricing lines (which are stored separately in pricing_lines).
function stripPricingFromUsage(usage: any): any {
    if (!usage || typeof usage !== 'object') return usage;
    const { pricing: _omit, ...rest } = usage;
    return rest;
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
    generationMs?: number | null; latencyMs?: number | null;
    internalLatencyMs?: number | null;
    usagePriced: any; totalCents: number; totalNanos?: number | null; currency: "USD" | string;
    finishReason?: string | null;
    statusCode: number; throughput?: number | null; keyId?: string | null;
    extraJson?: string | null;
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
        });

        let supabaseError: Error | null = null;
        try {
            await retryWithBackoff(() => upsertGatewayRequest(row), "supabase_audit_success_upsert");
        } catch (err) {
            supabaseError = err instanceof Error ? err : new Error(String(err));
        }

        try {
            await retryWithBackoff(() => sendAxiomEvent({
                requestId: args.requestId,
                teamId: args.teamId,
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
                nativeResponseId: args.nativeResponseId ?? null,
                statusCode: args.statusCode,
                success: true,
                errorCode: null,
                errorMessage: null,
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
            }), "axiom_audit_success_ingest");
        } catch (err) {
            console.error("[audit] Axiom ingest failed (non-blocking)", err);
        }

        if (supabaseError) throw supabaseError;
    } finally {
        releaseRuntime();
    }
}

/** FAILURE AUDIT — single function with discriminated union */
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
    extraJson?: string | null;
};
type AuditFailureExecute = {
    stage: "execute";
    requestId: string;
    teamId: string;
    endpoint: Endpoint;
    model: string;
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
    extraJson?: string | null;
};

export async function auditFailure(args: AuditFailureBefore | AuditFailureExecute) {
    const releaseRuntime = ensureRuntimeForBackground();
    try {
        const bindings = getBindings();
        const runSupabase = async (row: any, label: string) => {
            await retryWithBackoff(() => upsertGatewayRequest(row), label);
        };
        const runAxiom = async (payload: Parameters<typeof sendAxiomEvent>[0], label: string) => {
            try {
                await retryWithBackoff(() => sendAxiomEvent(payload), label);
            } catch (err) {
                console.error("[audit] Axiom ingest failed (non-blocking)", err);
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
            });

            let supabaseError: Error | null = null;
            if (args.teamId) {
                try {
                    await runSupabase(row, "supabase_audit_failure_before_upsert");
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
                nativeResponseId: null,
                statusCode: args.statusCode,
                success: false,
                errorCode: args.errorCode,
                errorMessage: args.errorMessage ?? null,
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
            provider: null,
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
        });

        let supabaseError: Error | null = null;
        if (args.teamId) {
            try {
                await runSupabase(row, "supabase_audit_failure_execute_upsert");
            } catch (err) {
                supabaseError = err instanceof Error ? err : new Error(String(err));
            }
        }

        await runAxiom({
            requestId: args.requestId,
            teamId: args.teamId,
            provider: "unknown",
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
            nativeResponseId: null,
            statusCode: args.statusCode,
            success: false,
            errorCode: args.errorCode,
            errorMessage: args.errorMessage ?? null,
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
