// src/lib/gateway/audit/index.ts
// Purpose: Persist audits and send analytics events.
// Why: Ensures observability for every request.
// How: Builds audit rows and ships them to Supabase with retries.

import { getSupabaseAdmin, ensureRuntimeForBackground, isLocalTestingModeEnabled } from "@/runtime/env";
import { ensureAppId } from "../after/apps";
import type { Endpoint } from "@core/types";
import { syncWorkspaceUsageRollupForRequest } from "@core/workspace-usage-rollups";
import {
	buildGatewayRequestUsageColumns,
	buildV2RequestUsageMeters,
	stripGatewayRequestUsageColumns,
} from "../usage-columns";
import { persistGatewayIoLog, resolveGatewayIoLoggingPolicy } from "./io-logging";

function supaAdmin() {
    return getSupabaseAdmin();
}

const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 250;
let gatewayRequestsSupportsErrorPayloadColumn: boolean | null = null;
let gatewayRequestsSupportsUsageColumns: boolean | null = null;
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

function isMissingRpcError(error: unknown, rpc: string): boolean {
    const candidate = error && typeof error === "object" ? error as Record<string, unknown> : null;
    const cause = candidate?.cause && typeof candidate.cause === "object"
        ? candidate.cause as Record<string, unknown>
        : null;
    const code = String(cause?.code ?? candidate?.code ?? "");
    const message = String(cause?.message ?? candidate?.message ?? "").toLowerCase();
    if (code !== "PGRST202" && code !== "42883") return false;
    return message.includes(rpc.toLowerCase());
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
        gatewayRequestsSupportsUsageColumns === false
            ? stripGatewayRequestUsageColumns(
                gatewayRequestsSupportsErrorPayloadColumn === false
                    ? (() => {
                        const { error_payload: _omit, ...legacyRow } = row ?? {};
                        return legacyRow;
                    })()
                    : row,
            )
            : gatewayRequestsSupportsErrorPayloadColumn === false
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
        if (gatewayRequestsSupportsUsageColumns === null && "usage_total_tokens" in row) {
            gatewayRequestsSupportsUsageColumns = true;
        }
        return inserted;
    } catch (error) {
        if (
            gatewayRequestsSupportsUsageColumns !== false &&
            isMissingColumnError(error, "usage_", "gateway_requests")
        ) {
            gatewayRequestsSupportsUsageColumns = false;
            const legacyRow = stripGatewayRequestUsageColumns(row);
            return attemptInsert(
                gatewayRequestsSupportsErrorPayloadColumn === false
                    ? (() => {
                        const { error_payload: _omit, ...withoutErrorPayload } = legacyRow;
                        return withoutErrorPayload;
                    })()
                    : legacyRow,
            );
        }
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

async function upsertV2RequestFact(args: {
    requestId: string;
    workspaceId: string;
    appId?: string | null;
    keyId?: string | null;
    endpoint: Endpoint;
    requestedModel: string;
    routedModel?: string | null;
    provider?: string | null;
    providerApiModelId?: string | null;
    stream: boolean;
    byok: boolean;
    statusCode?: number | null;
    success: boolean;
    errorCode?: string | null;
    finishReason?: string | null;
    latencyMs?: number | null;
    generationMs?: number | null;
    internalDispatchMs?: number | null;
    gatewayTotalMs?: number | null;
    throughput?: number | null;
    edgeColo?: string | null;
    sessionId?: string | null;
    endUserId?: string | null;
    authMethod?: "api_key" | "oauth" | null;
    nativeResponseId?: string | null;
    userAgent?: string | null;
    costNanos?: number | null;
    currency?: string | null;
    toolCallCount?: number | null;
    toolCallSucceeded?: boolean | null;
    structuredOutputAttempted?: boolean;
    structuredOutputSucceeded?: boolean;
    structuredOutputSuccessBasis?: "json_parse" | "unobserved" | null;
    downstreamDisconnected?: boolean;
    streamCancellationSupport?: "supported" | "unsupported" | "unknown";
    streamProviderBillingOnCancel?: "stops" | "unknown";
    streamDisconnectAction?: "cancel_upstream" | "drain_upstream";
    usage?: unknown;
    pricingLines?: unknown[] | null;
    requestPayload?: unknown;
    gatewayResponse?: unknown;
    providerAttempts?: Array<Record<string, unknown>> | null;
    routingSnapshot?: Array<Record<string, unknown>> | null;
    routingDiagnostics?: Record<string, unknown> | null;
}) {
    const factorKeys = [
        "success_rate",
        "latency_score",
        "tail_latency_score",
        "throughput_score",
        "price_score",
        "reliability_sample",
        "reliability_observations",
        "token_affinity",
        "load_penalty",
        "base_weight",
        "rollout_multiplier",
        "routing_multiplier",
        "cache_boost_multiplier",
        "latency_preference_multiplier",
        "throughput_preference_multiplier",
    ] as const;
    const attempts = Array.isArray(args.providerAttempts) ? args.providerAttempts : [];
    const normalizedAttempts = attempts.map((attempt, index) => {
        const status = Number(attempt.status);
        const latency = Number(attempt.latency_ms ?? attempt.duration_ms);
        return {
            attempt_number: Number(attempt.attempt_number ?? index + 1),
            provider: typeof attempt.provider === "string" ? attempt.provider : null,
            provider_api_model_id:
                typeof attempt.api_model_id === "string" ? attempt.api_model_id :
                typeof attempt.provider_model_slug === "string" ? attempt.provider_model_slug : null,
            status_code: Number.isFinite(status) && status >= 100 && status <= 599 ? status : null,
            success: attempt.outcome === "success",
            error_code: typeof attempt.type === "string" && attempt.outcome !== "success"
                ? attempt.type
                : null,
            failure_class: typeof attempt.outcome === "string" && attempt.outcome !== "success"
                ? attempt.outcome
                : null,
            latency_ms: Number.isFinite(latency) ? Math.max(0, Math.round(latency)) : null,
            credential_phase: typeof attempt.credential_phase === "string" ? attempt.credential_phase : null,
            key_source: typeof attempt.key_source === "string" ? attempt.key_source : null,
            response_kind: typeof attempt.response_kind === "string" ? attempt.response_kind : null,
            retryable: attempt.retryable === true,
            was_probe: attempt.was_probe === true,
        };
    });
    const attemptedKeys = new Set(normalizedAttempts.map((attempt) =>
        `${attempt.provider ?? ""}::${attempt.provider_api_model_id ?? ""}`
    ));
    const rankedDecisions = (Array.isArray(args.routingSnapshot) ? args.routingSnapshot : [])
        .slice(0, 128)
        .map((entry, index) => {
            const provider = typeof entry.provider_id === "string"
                ? entry.provider_id
                : typeof entry.provider === "string" ? entry.provider : null;
            const providerApiModelId = typeof entry.provider_api_model_id === "string"
                ? entry.provider_api_model_id
                : typeof entry.provider_model_slug === "string" ? entry.provider_model_slug : null;
            return {
                decision_order: index + 1,
                decision: "ranked",
                rank: Number.isFinite(Number(entry.rank)) ? Number(entry.rank) : index + 1,
                provider,
                provider_api_model_id: providerApiModelId,
                score: Number.isFinite(Number(entry.score)) ? Number(entry.score) : null,
                selected: provider === args.provider && (
                    !args.providerApiModelId || providerApiModelId === args.providerApiModelId
                ),
                attempted: attemptedKeys.has(`${provider ?? ""}::${providerApiModelId ?? ""}`) ||
                    normalizedAttempts.some((attempt) => attempt.provider === provider),
                breaker: typeof entry.breaker === "string" ? entry.breaker : null,
                breaker_until_ms: Number.isFinite(Number(entry.breaker_until_ms))
                    ? Number(entry.breaker_until_ms)
                    : null,
                provider_status: typeof entry.provider_status === "string" ? entry.provider_status : null,
                provider_routing_status: typeof entry.provider_routing_status === "string"
                    ? entry.provider_routing_status : null,
                model_routing_status: typeof entry.model_routing_status === "string"
                    ? entry.model_routing_status : null,
                capability_status: typeof entry.capability_status === "string"
                    ? entry.capability_status : null,
                score_factors: Array.isArray(entry.score_factor_values)
                    ? Object.fromEntries(factorKeys.flatMap((key, factorIndex) => {
                        const value = Number(entry.score_factor_values?.[factorIndex]);
                        return Number.isFinite(value)
                            ? [[key, Number(value.toFixed(6))]]
                            : [];
                    }))
                    : entry.score_factors && typeof entry.score_factors === "object"
                        ? entry.score_factors : {},
            };
        });
    const filterStages = Array.isArray((args.routingDiagnostics as any)?.filterStages)
        ? (args.routingDiagnostics as any).filterStages
        : [];
    const excludedDecisions = filterStages.flatMap((stage: any) =>
        (Array.isArray(stage?.droppedProviders) ? stage.droppedProviders : []).map((entry: any) => ({
            decision_order: rankedDecisions.length + 1,
            decision: "excluded",
            rank: null,
            provider: typeof entry?.providerId === "string" ? entry.providerId : null,
            provider_api_model_id:
                typeof entry?.apiModelId === "string" ? entry.apiModelId :
                typeof entry?.providerModelSlug === "string" ? entry.providerModelSlug : null,
            score: null,
            selected: false,
            attempted: false,
            exclusion_stage: typeof stage?.stage === "string" ? stage.stage : null,
            exclusion_reason: typeof entry?.reason === "string" ? entry.reason : null,
            score_factors: {},
        }))
    ).slice(0, Math.max(0, 128 - rankedDecisions.length))
        .map((entry: Record<string, unknown>, index: number) => ({
            ...entry,
            decision_order: rankedDecisions.length + index + 1,
        }));
    const usageMeters = buildV2RequestUsageMeters({
        usage: args.usage ?? {},
        endpoint: args.endpoint,
        requestPayload: args.requestPayload,
        gatewayResponse: args.gatewayResponse,
    });
    const pricingLines = (Array.isArray(args.pricingLines) ? args.pricingLines : []).flatMap((raw) => {
        if (!raw || typeof raw !== "object") return [];
        const line = raw as Record<string, unknown>;
        const meterKey = typeof line.dimension === "string" ? line.dimension.trim().toLowerCase() : "";
        const quantity = Number(line.quantity ?? 0);
        const unitPriceUsd = Number(line.unit_price_usd ?? 0);
        const chargedNanos = Number(line.line_nanos ?? 0);
        if (!meterKey || !Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(chargedNanos)) return [];
        return [{
            meter_key: meterKey,
            quantity,
            unit: typeof line.unit === "string" ? line.unit : meterKey,
            unit_price_nanos: Number.isFinite(unitPriceUsd) ? Math.max(0, unitPriceUsd * 1_000_000_000) : 0,
            charged_nanos: Math.max(0, Math.round(chargedNanos)),
        }];
    });
    const event = {
            request_id: args.requestId,
            workspace_id: args.workspaceId,
            app_id: args.appId ?? null,
            key_id: args.keyId ?? null,
            endpoint: args.endpoint,
            requested_model_input: args.requestedModel,
            routed_model_slug: args.routedModel ?? null,
            provider: args.provider ?? null,
            provider_api_model_id: args.providerApiModelId ?? null,
            status_code: args.statusCode ?? null,
            success: args.success,
            error_code: args.errorCode ?? null,
            stop_reason: args.finishReason ?? null,
            stream: args.stream,
            byok: args.byok,
            latency_ms: args.latencyMs == null ? null : Math.max(0, Math.round(args.latencyMs)),
            generation_ms: args.generationMs == null ? null : Math.max(0, Math.round(args.generationMs)),
            internal_dispatch_ms: args.internalDispatchMs == null ? null : Math.max(0, args.internalDispatchMs),
            gateway_total_ms: args.gatewayTotalMs == null ? null : Math.max(0, args.gatewayTotalMs),
            throughput: args.throughput == null ? null : Math.max(0, args.throughput),
            cloudflare_colo: args.edgeColo ? args.edgeColo.trim().toUpperCase() : null,
            session_id: args.sessionId ?? null,
            end_user_id: args.endUserId ?? null,
            auth_method: args.authMethod ?? null,
            native_response_id: args.nativeResponseId ?? null,
            user_agent: args.userAgent ?? null,
            cost_nanos: args.costNanos == null ? null : Math.max(0, Math.round(args.costNanos)),
            currency: args.currency ?? null,
            tool_call_count: Math.max(0, Math.round(args.toolCallCount ?? 0)),
            tool_call_succeeded: args.toolCallSucceeded ?? null,
            structured_output_attempted: args.structuredOutputAttempted === true,
            structured_output_succeeded: args.structuredOutputSucceeded === true,
            attempts: normalizedAttempts,
            usage_meters: usageMeters,
            pricing_lines: pricingLines,
            routing_decisions: [...rankedDecisions, ...excludedDecisions],
            safe_metadata: {
                provider: args.provider ?? null,
                routed_model: args.routedModel ?? args.requestedModel,
                structured_output_success_basis: args.structuredOutputAttempted
                    ? (args.structuredOutputSuccessBasis ?? "unobserved")
                    : null,
                downstream_disconnected: args.downstreamDisconnected === true,
                stream_cancellation_support: args.streamCancellationSupport ?? "unknown",
                stream_provider_billing_on_cancel: args.streamProviderBillingOnCancel ?? "unknown",
                stream_disconnect_action: args.streamDisconnectAction ?? null,
            },
    };
    const client = supaAdmin();
    const routingRpc = "ingest_v2_gateway_request_with_routing";
    const { error } = await client.rpc(routingRpc, { p_event: event });
    if (!error) return;
    if (!isMissingRpcError(error, routingRpc)) throw error;

    const { routing_decisions: _routingDecisions, ...baseEvent } = event;
    const { error: baseError } = await client.rpc("ingest_v2_gateway_request", {
        p_event: baseEvent,
    });
    if (baseError) throw baseError;
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
    const payload = row;
    const { error } = await client
        .from("gateway_request_details")
        .insert(payload);
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
    requestPayload?: unknown;
    gatewayResponse?: unknown;
    edgeColo?: string | null;
    edgeCity?: string | null;
    edgeCountry?: string | null;
    edgeContinent?: string | null;
    edgeAsn?: number | null;
}) {
    const usageColumns = buildGatewayRequestUsageColumns({
        usage: args.usage ?? {},
        endpoint: args.endpoint,
        requestPayload: args.requestPayload,
        gatewayResponse: args.gatewayResponse,
    });

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
        ...usageColumns,
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

function isStructuredOutputRequest(payload: unknown): boolean {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
    const body = payload as Record<string, any>;
    const format = body.response_format ?? body.text?.format ?? null;
    if (!format || typeof format !== "object") return false;
    return format.type === "json_schema" || format.type === "json_object";
}

function extractStructuredOutput(value: unknown): unknown {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const response = value as Record<string, any>;
    if (response.output_parsed && typeof response.output_parsed === "object") return response.output_parsed;
    if (response.parsed && typeof response.parsed === "object") return response.parsed;
    if (typeof response.output_text === "string") return response.output_text;
    if (typeof response.text === "string") return response.text;
    const choiceContent = response.choices?.[0]?.message?.content;
    if (typeof choiceContent === "string") return choiceContent;
    const outputText = response.output?.flatMap?.((item: any) => item?.content ?? [])
        ?.find?.((item: any) => typeof item?.text === "string")?.text;
    if (typeof outputText === "string") return outputText;
    const anthropicText = response.content?.find?.((item: any) => typeof item?.text === "string")?.text;
    return typeof anthropicText === "string" ? anthropicText : null;
}

function structuredOutputResult(requestPayload: unknown, gatewayResponse: unknown): {
    attempted: boolean;
    succeeded: boolean;
    basis: "json_parse" | "unobserved" | null;
} {
    const attempted = isStructuredOutputRequest(requestPayload);
    if (!attempted) return { attempted: false, succeeded: false, basis: null };
    const output = extractStructuredOutput(gatewayResponse);
    if (output && typeof output === "object") {
        return { attempted: true, succeeded: true, basis: "json_parse" };
    }
    if (typeof output !== "string" || output.trim().length === 0) {
        return { attempted: true, succeeded: false, basis: "unobserved" };
    }
    try {
        JSON.parse(output);
        return { attempted: true, succeeded: true, basis: "json_parse" };
    } catch {
        return { attempted: true, succeeded: false, basis: "json_parse" };
    }
}

function readToolCallCount(usage: unknown, finishReason?: string | null): number {
    const record = usage && typeof usage === "object" && !Array.isArray(usage)
        ? usage as Record<string, unknown>
        : {};
    const count = Number(record.output_tool_call_count ?? record.tool_call_count ?? 0);
    if (Number.isFinite(count) && count > 0) return Math.round(count);
    return finishReason === "tool_calls" || finishReason === "tool_use" ? 1 : 0;
}

export async function auditSuccess(args: {
    requestId: string; workspaceId: string;
    provider: string; model: string; requestedModel?: string; endpoint: Endpoint;
    providerApiModelId?: string | null;
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
    endToEndMs?: number | null;
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
    downstreamDisconnected?: boolean;
    streamCancellationSupport?: "supported" | "unsupported" | "unknown";
    streamProviderBillingOnCancel?: "stops" | "unknown";
    streamDisconnectAction?: "cancel_upstream" | "drain_upstream";
}) {
    const releaseRuntime = ensureRuntimeForBackground();
    try {
        const pricingLines = args.usagePriced?.pricing?.lines ?? [];
        const strippedUsage = stripPricingFromUsage(args.usagePriced);
        const structuredOutput = structuredOutputResult(args.requestPayload, args.gatewayResponse);
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
            requestPayload: args.requestPayload,
            gatewayResponse: args.gatewayResponse,
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
            let v2PersistenceError: Error | null = null;
            try {
                await retryWithBackoff(() => upsertV2RequestFact({
                    requestId: args.requestId,
                    workspaceId: args.workspaceId,
                    appId,
                    keyId: args.keyId ?? null,
                    endpoint: args.endpoint,
                    requestedModel: args.requestedModel ?? args.model,
                    routedModel: args.model,
                    provider: args.provider,
                    providerApiModelId: args.providerApiModelId ?? null,
                    stream: args.stream,
                    byok: args.byok,
                    statusCode: args.statusCode,
                    success: true,
                    finishReason: args.finishReason ?? null,
                    latencyMs: args.latencyMs ?? null,
                    generationMs: args.generationMs ?? null,
                    internalDispatchMs: args.internalLatencyMs ?? null,
                    gatewayTotalMs: args.endToEndMs ?? null,
                    throughput: args.throughput ?? null,
                    edgeColo: args.edgeColo ?? null,
                    sessionId: args.sessionId ?? null,
                    endUserId: args.requestUserId ?? null,
                    authMethod: args.authMethod ?? null,
                    nativeResponseId: args.nativeResponseId ?? null,
                    userAgent: args.userAgent ?? null,
                    costNanos: args.totalNanos ?? (
                        Number.isFinite(args.totalCents)
                            ? Math.round(args.totalCents * 1e7)
                            : null
                    ),
                    currency: args.currency,
                    toolCallCount: readToolCallCount(strippedUsage, args.finishReason),
                    toolCallSucceeded: readToolCallCount(strippedUsage, args.finishReason) > 0 ? true : null,
                    structuredOutputAttempted: structuredOutput.attempted,
                    structuredOutputSucceeded: structuredOutput.succeeded,
                    structuredOutputSuccessBasis: structuredOutput.basis,
                    downstreamDisconnected: args.downstreamDisconnected === true,
                    streamCancellationSupport: args.streamCancellationSupport ?? "unknown",
                    streamProviderBillingOnCancel: args.streamProviderBillingOnCancel ?? "unknown",
                    streamDisconnectAction: args.streamDisconnectAction ?? "drain_upstream",
                    usage: strippedUsage,
                    pricingLines,
                    requestPayload: args.requestPayload,
                    gatewayResponse: args.gatewayResponse,
                    providerAttempts: args.providerAttempts ?? null,
                    routingSnapshot: Array.isArray((args.detailMetadata as any)?.routing_snapshot)
                        ? (args.detailMetadata as any).routing_snapshot
                        : null,
                    routingDiagnostics:
                        (args.detailMetadata as any)?.routing_diagnostics ?? null,
                }), "supabase_v2_audit_success_rpc");
            } catch (v2Error) {
                v2PersistenceError = v2Error instanceof Error ? v2Error : new Error(String(v2Error));
                console.error("[audit] v2 request fact persistence failed", {
                    requestId: args.requestId,
                    error: v2Error instanceof Error ? v2Error.message : String(v2Error),
                });
            }
            const ioLoggingPolicy = await resolveGatewayIoLoggingPolicy({
                workspaceId: args.workspaceId,
                keyId: args.keyId ?? null,
            });
            if (ioLoggingPolicy.captureEnabled) {
                await persistGatewayIoLog({
                requestId: args.requestId,
                workspaceId: args.workspaceId,
                appId,
                keyId: args.keyId ?? null,
                endpoint: args.endpoint,
                modelId: args.model,
                provider: args.provider ?? null,
                statusCode: args.statusCode,
                success: true,
                requestPayload: args.requestPayload,
                gatewayResponse: args.gatewayResponse,
                providerRequest: args.providerRequest,
                providerResponse: args.providerResponse,
                metadata: args.detailMetadata ?? {},
                }, ioLoggingPolicy);
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
            }
            if (v2PersistenceError) throw v2PersistenceError;
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
    requestedModel?: string | null;
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
    providerApiModelId?: string | null;
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
    usage?: Record<string, unknown> | null;
    currency?: string | null;
    pricingLines?: unknown[] | null;
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
                canonicalModel: args.requestedModel ?? args.model ?? null,
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
                requestPayload: args.requestPayload,
                gatewayResponse: args.gatewayResponse,
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
                    let v2PersistenceError: Error | null = null;
                    try {
                        await retryWithBackoff(() => upsertV2RequestFact({
                            requestId: args.requestId,
                            workspaceId: args.workspaceId,
                            appId: resolvedAppId,
                            keyId: args.keyId ?? null,
                            endpoint: args.endpoint,
                            requestedModel: args.requestedModel ?? args.model ?? "unknown",
                            stream: false,
                            byok: false,
                            statusCode: args.statusCode,
                            success: false,
                            errorCode: args.errorCode,
                            latencyMs: args.latencyMs ?? null,
                            internalDispatchMs: args.internalLatencyMs ?? null,
                            edgeColo: args.edgeColo ?? null,
                            sessionId: args.sessionId ?? null,
                            endUserId: args.requestUserId ?? null,
                            authMethod: args.authMethod ?? null,
                            userAgent: args.userAgent ?? null,
                            structuredOutputAttempted: isStructuredOutputRequest(args.requestPayload),
                            structuredOutputSucceeded: false,
                            requestPayload: args.requestPayload,
                            gatewayResponse: args.gatewayResponse,
                            providerAttempts: args.providerAttempts ?? null,
                            routingSnapshot: Array.isArray((args.detailMetadata as any)?.routing_snapshot)
                                ? (args.detailMetadata as any).routing_snapshot
                                : null,
                            routingDiagnostics:
                                (args.detailMetadata as any)?.routing_diagnostics ?? null,
                        }), "supabase_v2_audit_failure_before_rpc");
                    } catch (v2Error) {
                        v2PersistenceError = v2Error instanceof Error ? v2Error : new Error(String(v2Error));
                        console.error("[audit] v2 request fact persistence failed", {
                            requestId: args.requestId,
                            error: v2Error instanceof Error ? v2Error.message : String(v2Error),
                        });
                    }
                    const ioLoggingPolicy = await resolveGatewayIoLoggingPolicy({
                        workspaceId: args.workspaceId,
                        keyId: args.keyId ?? null,
                    });
                    if (ioLoggingPolicy.captureEnabled) {
                        await persistGatewayIoLog({
                        requestId: args.requestId,
                        workspaceId: args.workspaceId,
                        appId: resolvedAppId ?? null,
                        keyId: args.keyId ?? null,
                        endpoint: args.endpoint,
                        modelId: args.requestedModel ?? args.model ?? "unknown",
                        provider: null,
                        statusCode: args.statusCode,
                        success: false,
                        requestPayload: args.requestPayload,
                        gatewayResponse: args.gatewayResponse,
                        providerRequest: null,
                        providerResponse: args.providerResponse,
                        metadata: args.detailMetadata ?? {},
                        }, ioLoggingPolicy);
                        await insertGatewayRequestDetailsNonBlocking(
                            {
                            gateway_request_id: insertedRow.id,
                            gateway_request_created_at: insertedRow.created_at,
                            request_id: args.requestId,
                            workspace_id: args.workspaceId,
                            app_id: resolvedAppId ?? null,
                            key_id: args.keyId ?? null,
                            endpoint: args.endpoint,
                            model_id: args.requestedModel ?? args.model ?? "unknown",
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
                    }
                    if (v2PersistenceError) throw v2PersistenceError;
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
            usage: args.usage ?? {},
            requestPayload: args.requestPayload,
            gatewayResponse: args.gatewayResponse,
            currency: args.currency ?? null,
            pricingLines: args.pricingLines ?? [],
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
                let v2PersistenceError: Error | null = null;
                try {
                    await retryWithBackoff(() => upsertV2RequestFact({
                        requestId: args.requestId,
                        workspaceId: args.workspaceId,
                        appId: resolvedAppId,
                        keyId: args.keyId ?? null,
                        endpoint: args.endpoint,
                        requestedModel: args.requestedModel ?? args.model,
                        routedModel: args.model,
                        provider: args.provider ?? null,
                        providerApiModelId: args.providerApiModelId ?? null,
                        stream: args.stream,
                        byok: args.byok === true,
                        statusCode: args.statusCode,
                        success: false,
                        errorCode: args.errorCode,
                        latencyMs: args.latencyMs ?? null,
                        generationMs: args.generationMs ?? null,
                        internalDispatchMs: args.internalLatencyMs ?? null,
                        edgeColo: args.edgeColo ?? null,
                        sessionId: args.sessionId ?? null,
                        endUserId: args.requestUserId ?? null,
                        authMethod: args.authMethod ?? null,
                        userAgent: args.userAgent ?? null,
                        currency: args.currency ?? null,
                        toolCallCount: readToolCallCount(args.usage, null),
                        toolCallSucceeded: readToolCallCount(args.usage, null) > 0 ? false : null,
                        structuredOutputAttempted: isStructuredOutputRequest(args.requestPayload),
                        structuredOutputSucceeded: false,
                        usage: args.usage ?? {},
                        pricingLines: args.pricingLines ?? [],
                        requestPayload: args.requestPayload,
                        gatewayResponse: args.gatewayResponse,
                        providerAttempts: args.providerAttempts ?? null,
                        routingSnapshot: Array.isArray((args.detailMetadata as any)?.routing_snapshot)
                            ? (args.detailMetadata as any).routing_snapshot
                            : null,
                        routingDiagnostics:
                            (args.detailMetadata as any)?.routing_diagnostics ?? null,
                    }), "supabase_v2_audit_failure_execute_rpc");
                } catch (v2Error) {
                    v2PersistenceError = v2Error instanceof Error ? v2Error : new Error(String(v2Error));
                    console.error("[audit] v2 request fact persistence failed", {
                        requestId: args.requestId,
                        error: v2Error instanceof Error ? v2Error.message : String(v2Error),
                    });
                }
                const ioLoggingPolicy = await resolveGatewayIoLoggingPolicy({
                    workspaceId: args.workspaceId,
                    keyId: args.keyId ?? null,
                });
                if (ioLoggingPolicy.captureEnabled) {
                    await persistGatewayIoLog({
                    requestId: args.requestId,
                    workspaceId: args.workspaceId,
                    appId: resolvedAppId ?? null,
                    keyId: args.keyId ?? null,
                    endpoint: args.endpoint,
                    modelId: args.model,
                    provider: args.provider ?? null,
                    statusCode: args.statusCode,
                    success: false,
                    requestPayload: args.requestPayload,
                    gatewayResponse: args.gatewayResponse,
                    providerRequest: args.providerRequest,
                    providerResponse: args.providerResponse,
                    metadata: args.detailMetadata ?? {},
                    }, ioLoggingPolicy);
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
                }
                if (v2PersistenceError) throw v2PersistenceError;
            } catch (err) {
                supabaseError = err instanceof Error ? err : new Error(String(err));
            }
        }

        if (supabaseError) throw supabaseError;
    } finally {
        releaseRuntime();
    }
}










