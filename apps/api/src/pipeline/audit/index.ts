// src/lib/gateway/audit/index.ts
// Purpose: Persist audits and send analytics events.
// Why: Ensures observability for every request.
// How: Builds audit rows and ships them to Supabase with retries.

import { getSupabaseAdmin, ensureRuntimeForBackground, isLocalTestingModeEnabled } from "@/runtime/env";
import { ensureAppId } from "../after/apps";
import type { Endpoint } from "@core/types";
import { syncWorkspaceUsageRollupForRequest } from "@core/workspace-usage-rollups";

function supaAdmin() {
    return getSupabaseAdmin();
}

const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 250;
let gatewayRequestsSupportsErrorPayloadColumn: boolean | null = null;
let gatewayRequestDetailsTableAvailable: boolean | null = null;
let warnedMissingGatewayRequestDetailsTable = false;

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

function isMissingColumnError(
    error: unknown,
    column: string,
    table?: string,
): boolean {
    const candidate = error && typeof error === "object" ? error as Record<string, unknown> : null;
    const cause = candidate?.cause && typeof candidate.cause === "object"
        ? candidate.cause as Record<string, unknown>
        : null;
    const code = String(cause?.code ?? candidate?.code ?? "");
    const message = String(cause?.message ?? candidate?.message ?? "");
    if (code !== "PGRST204" && code !== "42703") return false;
    if (!message.toLowerCase().includes(column.toLowerCase())) return false;
    if (!table) return true;
    return message.toLowerCase().includes(table.toLowerCase());
}

function isMissingTableError(error: unknown, table: string): boolean {
    const candidate = error && typeof error === "object" ? error as Record<string, unknown> : null;
    const cause = candidate?.cause && typeof candidate.cause === "object"
        ? candidate.cause as Record<string, unknown>
        : null;
    const code = String(cause?.code ?? candidate?.code ?? "");
    const message = String(cause?.message ?? candidate?.message ?? "");
    if (code !== "PGRST205" && code !== "42P01") return false;
    const normalizedTable = table.toLowerCase();
    const normalizedMessage = message.toLowerCase();
    return (
        normalizedMessage.includes(normalizedTable) ||
        normalizedMessage.includes(`'${normalizedTable}'`) ||
        normalizedMessage.includes(`"${normalizedTable}"`)
    );
}

async function insertGatewayRequest(row: any) {
    const client = supaAdmin();
    const attemptInsert = async (payload: any) => {
        const { data, error } = await client
            .from("gateway_requests")
            .insert(payload)
            .select("id, created_at, workspace_id")
            .single();
        if (error) {
            const err = new Error(`[audit] insert gateway_requests error: ${error?.message ?? "unknown"}`);
            (err as any).cause = error;
            throw err;
        }
        return data as { id: string; created_at: string; workspace_id: string };
    };

    const initialRow =
        gatewayRequestsSupportsErrorPayloadColumn === false
            ? (() => {
                const { error_payload: _omit, ...legacyRow } = row ?? {};
                return legacyRow;
            })()
            : row;

    try {
        const inserted = await attemptInsert(initialRow);
        if (gatewayRequestsSupportsErrorPayloadColumn === null && "error_payload" in row) {
            gatewayRequestsSupportsErrorPayloadColumn = true;
        }
        return inserted;
    } catch (error) {
        if (
            "error_payload" in row &&
            gatewayRequestsSupportsErrorPayloadColumn !== false &&
            isMissingColumnError(error, "error_payload", "gateway_requests")
        ) {
            gatewayRequestsSupportsErrorPayloadColumn = false;
            const { error_payload: _omit, ...legacyRow } = row;
            return attemptInsert(legacyRow);
        }
        throw error;
    }
}

function normalizeJsonValue(value: unknown): unknown {
    if (value === undefined) return null;
    if (value === null) return null;
    if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
    ) {
        return value;
    }
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return null;
    }
}

function extractReplayContent(value: unknown): unknown {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const payload = value as Record<string, unknown>;
    if (Array.isArray(payload.messages)) return payload.messages;
    if (Array.isArray(payload.input)) return payload.input;
    if (Array.isArray(payload.input_items)) return payload.input_items;
    if (Array.isArray(payload.contents)) return payload.contents;
    return null;
}

async function insertGatewayRequestDetails(row: any) {
    if (gatewayRequestDetailsTableAvailable === false) {
        return;
    }
    const client = supaAdmin();
    const { error } = await client
        .from("gateway_request_details")
        .insert(row);
    if (error) {
        if (
            isLocalTestingModeEnabled() &&
            isMissingTableError(error, "gateway_request_details")
        ) {
            gatewayRequestDetailsTableAvailable = false;
            if (!warnedMissingGatewayRequestDetailsTable) {
                warnedMissingGatewayRequestDetailsTable = true;
                console.warn(
                    "[audit] gateway_request_details not available in local testing mode; skipping request detail persistence."
                );
            }
            return;
        }
        const err = new Error(`[audit] insert gateway_request_details error: ${error?.message ?? "unknown"}`);
        (err as any).cause = error;
        throw err;
    }
    if (gatewayRequestDetailsTableAvailable === null) {
        gatewayRequestDetailsTableAvailable = true;
    }
}

async function syncInsertedRequestRollup(
    insertedRow: { id: string; created_at: string; workspace_id: string } | null | undefined,
    context: string,
) {
    if (!insertedRow?.id || !insertedRow?.created_at || !insertedRow?.workspace_id) {
        return;
    }
    try {
        await syncWorkspaceUsageRollupForRequest({
            requestRowId: insertedRow.id,
            requestCreatedAt: insertedRow.created_at,
            workspaceId: insertedRow.workspace_id,
            context,
        });
    } catch (error) {
        console.error("[audit] failed to sync workspace usage rollup", {
            context,
            requestRowId: insertedRow.id,
            workspaceId: insertedRow.workspace_id,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

async function insertGatewayRequestDetailsNonBlocking(
    row: Record<string, unknown>,
    context: string,
) {
    try {
        await retryWithBackoff(
            () => insertGatewayRequestDetails(row),
            context,
        );
    } catch (error) {
        console.error("[audit] failed to persist request details", {
            context,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

function buildSupaRow(args: {
    requestId: string; workspaceId?: string | null;
    endpoint: Endpoint; model?: string | null; canonicalModel?: string | null; provider?: string | null;
    stream?: boolean; byok?: boolean;
    nativeResponseId?: string | null;
    authMethod?: "api_key" | "oauth" | null;
    oauthClientId?: string | null;
    oauthUserId?: string | null;
    requestUserId?: string | null;
    sessionId?: string | null;
    traceData?: Record<string, unknown> | null;
    providerAttempts?: Array<Record<string, unknown>> | null;
    statusCode?: number | null; success: boolean;
    errorCode?: string | null; errorMessage?: string | null;
    errorPayload?: Record<string, unknown> | null;
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
        workspace_id: args.workspaceId ?? null,
        app_id: args.appId ?? null,
        endpoint: args.endpoint,
        model_id: args.model ?? null,
        canonical_model_id: args.canonicalModel ?? args.model ?? null,
        provider: args.provider ?? null,
        native_response_id: args.nativeResponseId ?? null,
        auth_method: args.authMethod ?? "api_key",
        oauth_client_id: args.oauthClientId ?? null,
        oauth_user_id: args.oauthUserId ?? null,
        end_user_id: args.requestUserId ?? null,
        session_id: args.sessionId ?? null,
        trace_data: args.traceData ?? null,
        provider_attempts: Array.isArray(args.providerAttempts) ? args.providerAttempts : [],
        stream: !!args.stream,
        byok: !!args.byok,
        status_code: args.statusCode ?? null,
        success: !!args.success,
        error_code: args.errorCode ?? null,
        error_message: args.errorMessage ?? null,
        error_payload:
            args.errorPayload && typeof args.errorPayload === "object"
                ? args.errorPayload
                : null,
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

export async function auditSuccess(args: {
    requestId: string; workspaceId: string;
    provider: string; model: string; requestedModel?: string; endpoint: Endpoint;
    stream: boolean; byok: boolean;
    nativeResponseId?: string | null;
    appTitle?: string | null; referer?: string | null;
    appId?: string | null; appName?: string | null;
    requestMethod?: string | null;
    requestPath?: string | null;
    requestUrl?: string | null;
    authMethod?: "api_key" | "oauth" | null;
    oauthClientId?: string | null;
    oauthUserId?: string | null;
    requestUserId?: string | null;
    sessionId?: string | null;
    traceData?: Record<string, unknown> | null;
    providerAttempts?: Array<Record<string, unknown>> | null;
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
    errorPayload?: Record<string, unknown> | null;
    requestPayload?: unknown;
    gatewayResponse?: unknown;
    providerRequest?: unknown;
    providerResponse?: unknown;
    detailMetadata?: Record<string, unknown> | null;
    // Wide event enrichment
    teamEnrichment?: any | null;
    keyEnrichment?: any | null;
    requestEnrichment?: any | null;
    routingContext?: any | null;
}) {
    const releaseRuntime = ensureRuntimeForBackground();
    try {
        const pricingLines = args.usagePriced?.pricing?.lines ?? [];
        const strippedUsage = stripPricingFromUsage(args.usagePriced);
        const appId = await ensureAppId({
            workspaceId: args.workspaceId,
            appTitle: args.appTitle ?? null,
            referer: args.referer ?? null,
            appId: args.appId ?? null,
            appName: args.appName ?? null,
        });
        if (!appId) {
            console.error("[audit] ensureAppId returned null", {
                requestId: args.requestId,
                workspaceId: args.workspaceId,
                appTitle: args.appTitle ?? null,
                referer: args.referer ?? null,
                appIdHeader: args.appId ?? null,
                appNameHeader: args.appName ?? null,
            });
        }
        const row = buildSupaRow({
            requestId: args.requestId,
            workspaceId: args.workspaceId,
            endpoint: args.endpoint,
            model: args.model,
            canonicalModel: args.requestedModel ?? args.model,
            provider: args.provider,
            stream: args.stream,
            byok: args.byok,
            nativeResponseId: args.nativeResponseId ?? null,
            authMethod: args.authMethod ?? "api_key",
            oauthClientId: args.oauthClientId ?? null,
            oauthUserId: args.oauthUserId ?? null,
            requestUserId: args.requestUserId ?? null,
            sessionId: args.sessionId ?? null,
            traceData: args.traceData ?? null,
            providerAttempts: args.providerAttempts ?? null,
            statusCode: args.statusCode,
            success: true,
            errorCode: null,
            errorMessage: null,
            errorPayload: null,
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
            const insertedRow = await retryWithBackoff(
                () => insertGatewayRequest(row),
                "supabase_audit_success_insert",
            );
            await syncInsertedRequestRollup(insertedRow, "audit_success");
            await insertGatewayRequestDetailsNonBlocking(
                {
                    gateway_request_id: insertedRow.id,
                    gateway_request_created_at: insertedRow.created_at,
                    request_id: args.requestId,
                    workspace_id: args.workspaceId,
                    app_id: appId ?? null,
                    key_id: args.keyId ?? null,
                    endpoint: args.endpoint,
                    model_id: args.model,
                    provider: args.provider ?? null,
                    status_code: args.statusCode,
                    success: true,
                    request_payload: normalizeJsonValue(args.requestPayload) ?? {},
                    request_content: normalizeJsonValue(extractReplayContent(args.requestPayload)),
                    gateway_response: normalizeJsonValue(args.gatewayResponse),
                    response_content: normalizeJsonValue(extractReplayContent(args.gatewayResponse)),
                    provider_request: normalizeJsonValue(args.providerRequest),
                    provider_response: normalizeJsonValue(args.providerResponse),
                    metadata: normalizeJsonValue(args.detailMetadata) ?? {},
                },
                "supabase_audit_success_details_insert",
            );
        } catch (err) {
            supabaseError = err instanceof Error ? err : new Error(String(err));
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
    workspaceId?: string | null;
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
    appId?: string | null;
    appName?: string | null;
    requestMethod?: string | null;
    requestPath?: string | null;
    requestUrl?: string | null;
    authMethod?: "api_key" | "oauth" | null;
    oauthClientId?: string | null;
    oauthUserId?: string | null;
    requestUserId?: string | null;
    sessionId?: string | null;
    traceData?: Record<string, unknown> | null;
    providerAttempts?: Array<Record<string, unknown>> | null;
    errorPayload?: Record<string, unknown> | null;
    userAgent?: string | null;
    clientIp?: string | null;
    cfRay?: string | null;
    edgeColo?: string | null;
    edgeCity?: string | null;
    edgeCountry?: string | null;
    edgeContinent?: string | null;
    edgeAsn?: number | null;
    extraJson?: string | null;
    requestPayload?: unknown;
    gatewayResponse?: unknown;
    providerResponse?: unknown;
    detailMetadata?: Record<string, unknown> | null;
};
type AuditFailureExecute = {
    stage: "execute";
    requestId: string;
    workspaceId: string;
    endpoint: Endpoint;
    model: string;
    requestedModel?: string;
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
    appId?: string | null;
    appName?: string | null;
    requestMethod?: string | null;
    requestPath?: string | null;
    requestUrl?: string | null;
    authMethod?: "api_key" | "oauth" | null;
    oauthClientId?: string | null;
    oauthUserId?: string | null;
    requestUserId?: string | null;
    sessionId?: string | null;
    traceData?: Record<string, unknown> | null;
    providerAttempts?: Array<Record<string, unknown>> | null;
    errorPayload?: Record<string, unknown> | null;
    userAgent?: string | null;
    clientIp?: string | null;
    cfRay?: string | null;
    edgeColo?: string | null;
    edgeCity?: string | null;
    edgeCountry?: string | null;
    edgeContinent?: string | null;
    edgeAsn?: number | null;
    extraJson?: string | null;
    requestPayload?: unknown;
    gatewayResponse?: unknown;
    providerRequest?: unknown;
    providerResponse?: unknown;
    detailMetadata?: Record<string, unknown> | null;
};

export async function auditFailure(args: AuditFailureBefore | AuditFailureExecute) {
    const releaseRuntime = ensureRuntimeForBackground();
    try {
        if (args.stage === "before") {
            const resolvedAppId = args.workspaceId
                ? await ensureAppId({
                    workspaceId: args.workspaceId,
                    appTitle: args.appTitle ?? null,
                    referer: args.referer ?? null,
                    appId: args.appId ?? null,
                    appName: args.appName ?? null,
                })
                : null;
            const row = buildSupaRow({
                requestId: args.requestId,
                workspaceId: args.workspaceId ?? null,
                endpoint: args.endpoint,
                model: args.model ?? null,
                canonicalModel: args.model ?? null,
                provider: null,
                stream: false,
                byok: false,
                nativeResponseId: null,
                authMethod: args.authMethod ?? "api_key",
                oauthClientId: args.oauthClientId ?? null,
                oauthUserId: args.oauthUserId ?? null,
                requestUserId: args.requestUserId ?? null,
                sessionId: args.sessionId ?? null,
                traceData: args.traceData ?? null,
                providerAttempts: args.providerAttempts ?? null,
                statusCode: args.statusCode,
                success: false,
                errorCode: args.errorCode,
                errorMessage: args.errorMessage ?? null,
                errorPayload: args.errorPayload ?? null,
                appId: resolvedAppId,
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
            if (args.workspaceId) {
                try {
                    const insertedRow = await retryWithBackoff(
                        () => insertGatewayRequest(row),
                        "supabase_audit_failure_before_insert",
                    );
                    await syncInsertedRequestRollup(insertedRow, "audit_failure_before");
                    await insertGatewayRequestDetailsNonBlocking(
                        {
                            gateway_request_id: insertedRow.id,
                            gateway_request_created_at: insertedRow.created_at,
                            request_id: args.requestId,
                            workspace_id: args.workspaceId,
                            app_id: resolvedAppId ?? null,
                            key_id: args.keyId ?? null,
                            endpoint: args.endpoint,
                            model_id: args.model ?? "unknown",
                            provider: null,
                            status_code: args.statusCode,
                            success: false,
                            request_payload: normalizeJsonValue(args.requestPayload) ?? {},
                            request_content: normalizeJsonValue(extractReplayContent(args.requestPayload)),
                            gateway_response: normalizeJsonValue(args.gatewayResponse),
                            response_content: normalizeJsonValue(extractReplayContent(args.gatewayResponse)),
                            provider_request: null,
                            provider_response: normalizeJsonValue(args.providerResponse),
                            metadata: normalizeJsonValue(args.detailMetadata) ?? {},
                        },
                        "supabase_audit_failure_before_details_insert",
                    );
                } catch (err) {
                    supabaseError = err instanceof Error ? err : new Error(String(err));
                }
            }

            if (supabaseError) throw supabaseError;
            return;
        }

        // stage === "execute"
        const resolvedAppId = await ensureAppId({
            workspaceId: args.workspaceId,
            appTitle: args.appTitle ?? null,
            referer: args.referer ?? null,
            appId: args.appId ?? null,
            appName: args.appName ?? null,
        });
        const row = buildSupaRow({
            requestId: args.requestId,
            workspaceId: args.workspaceId,
            endpoint: args.endpoint,
            model: args.model,
            canonicalModel: args.requestedModel ?? args.model,
            provider: args.provider ?? null,
            stream: !!args.stream,
            byok: !!args.byok,
            nativeResponseId: null,
            authMethod: args.authMethod ?? "api_key",
            oauthClientId: args.oauthClientId ?? null,
            oauthUserId: args.oauthUserId ?? null,
            requestUserId: args.requestUserId ?? null,
            sessionId: args.sessionId ?? null,
            traceData: args.traceData ?? null,
            providerAttempts: args.providerAttempts ?? null,
            statusCode: args.statusCode,
            success: false,
            errorCode: args.errorCode,
            errorMessage: args.errorMessage ?? null,
            errorPayload: args.errorPayload ?? null,
            appId: resolvedAppId,
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
        if (args.workspaceId) {
            try {
                const insertedRow = await retryWithBackoff(
                    () => insertGatewayRequest(row),
                    "supabase_audit_failure_execute_insert",
                );
                await syncInsertedRequestRollup(insertedRow, "audit_failure_execute");
                await insertGatewayRequestDetailsNonBlocking(
                    {
                        gateway_request_id: insertedRow.id,
                        gateway_request_created_at: insertedRow.created_at,
                        request_id: args.requestId,
                        workspace_id: args.workspaceId,
                        app_id: resolvedAppId ?? null,
                        key_id: args.keyId ?? null,
                        endpoint: args.endpoint,
                        model_id: args.model,
                        provider: args.provider ?? null,
                        status_code: args.statusCode,
                        success: false,
                        request_payload: normalizeJsonValue(args.requestPayload) ?? {},
                        request_content: normalizeJsonValue(extractReplayContent(args.requestPayload)),
                        gateway_response: normalizeJsonValue(args.gatewayResponse),
                        response_content: normalizeJsonValue(extractReplayContent(args.gatewayResponse)),
                        provider_request: normalizeJsonValue(args.providerRequest),
                        provider_response: normalizeJsonValue(args.providerResponse),
                        metadata: normalizeJsonValue(args.detailMetadata) ?? {},
                    },
                    "supabase_audit_failure_execute_details_insert",
                );
            } catch (err) {
                supabaseError = err instanceof Error ? err : new Error(String(err));
            }
        }

        if (supabaseError) throw supabaseError;
    } finally {
        releaseRuntime();
    }
}










