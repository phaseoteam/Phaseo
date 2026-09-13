// src/lib/gateway/audit/index.ts
// Purpose: Persist audits and send analytics events.
// Why: Ensures observability for every request.
// How: Builds audit rows and ships them to Supabase with retries.

import { getSupabaseAdmin, ensureRuntimeForBackground, isLocalTestingModeEnabled } from "@/runtime/env";
import { ensureAppId } from "../after/apps";
import type { Endpoint, RequestLabel } from "@core/types";
import { normalizeTextServiceTier, readRequestedServiceTier } from "@core/serviceTiers";
import { syncWorkspaceUsageRollupForRequest } from "@core/workspace-usage-rollups";
import {
	buildGatewayRequestUsageColumns,
	buildV2RequestUsageMeters,
	stripGatewayRequestUsageColumns,
} from "../usage-columns";
import { persistGatewayIoLog, resolveGatewayIoLoggingPolicy } from "./io-logging";
import { persistGatewayUpstreamRequests } from "./upstream-requests";
import { protectStealthAuditArgs } from "./stealth-identity";
import {
	validateStructuredOutputResponse,
	validateToolCallResponses,
	type StructuredOutputValidation,
	type ToolCallValidation,
} from "./response-validation";

function supaAdmin() {
    return getSupabaseAdmin();
}





function positiveMetric(value: number | null | undefined, round = false): number | null {
    if (value == null || !Number.isFinite(value) || value <= 0) return null;
    const normalized = round ? Math.round(value) : value;
    return normalized > 0 ? normalized : null;
}

function cachedInputTokensAreSubset(usage: unknown): boolean {
    if (!usage || typeof usage !== "object") return false;
    const record = usage as Record<string, unknown>;
    if (record.cached_read_tokens_are_subset_of_input === true) return true;
    return [record.input_tokens_details, record.prompt_tokens_details].some((details) =>
        details != null &&
        typeof details === "object" &&
        typeof (details as Record<string, unknown>).cached_tokens === "number"
    );
}

type CanonicalServiceTier = "standard" | "priority" | "flex" | "batch";

function canonicalServiceTier(value: unknown): CanonicalServiceTier | null {
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "default") return "standard";
    }
    const normalized = normalizeTextServiceTier(value);
    if (normalized === "fast" || normalized === "priority") return "priority";
    return normalized ?? null;
}

function nestedValue(root: unknown, path: string[]): unknown {
    let current = root;
    for (const key of path) {
        if (!current || typeof current !== "object") return undefined;
        current = (current as Record<string, unknown>)[key];
    }
    return current;
}

export function resolveAuditServiceTiers(args: {
    endpoint: Endpoint;
    requestPayload?: unknown;
    usage?: unknown;
    gatewayResponse?: unknown;
}): {
    requested: CanonicalServiceTier | null;
    observed: CanonicalServiceTier | null;
    effective: CanonicalServiceTier | null;
} {
    const requested = args.endpoint === "batch"
        ? "batch"
        : canonicalServiceTier(readRequestedServiceTier(args.requestPayload).value);
    const observedCandidates = [
        nestedValue(args.usage, ["service_tier"]),
        nestedValue(args.usage, ["serviceTier"]),
        nestedValue(args.gatewayResponse, ["service_tier"]),
        nestedValue(args.gatewayResponse, ["serviceTier"]),
        nestedValue(args.gatewayResponse, ["usage", "service_tier"]),
        nestedValue(args.gatewayResponse, ["usage", "serviceTier"]),
    ];
    const observed = observedCandidates
        .map(canonicalServiceTier)
        .find((tier): tier is CanonicalServiceTier => tier !== null) ?? null;
    return {
        requested,
        observed,
        effective: observed ?? requested,
    };
}

const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 250;
let gatewayRequestsSupportsErrorPayloadColumn: boolean | null = null;
let gatewayRequestsSupportsUsageColumns: boolean | null = null;
let gatewayRequestsSupportsTelemetryColumns: boolean | null = null;
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

    const stripTelemetryColumns = (payload: any) => {
        const {
            provider_ttft_ms: _providerTtftMs,
            gateway_ttft_ms: _gatewayTtftMs,
            output_speed_tps: _outputSpeedTps,
            tpot_ms: _tpotMs,
            itl_ms: _itlMs,
            phaseo_overhead_ms: _phaseoOverheadMs,
            ...compatibleRow
        } = payload ?? {};
        return compatibleRow;
    };
    const prepareCompatibleRow = (payload: any) => {
        const telemetryCompatible = gatewayRequestsSupportsTelemetryColumns === false
            ? stripTelemetryColumns(payload)
            : payload;
        const usageCompatible = gatewayRequestsSupportsUsageColumns === false
            ? stripGatewayRequestUsageColumns(telemetryCompatible)
            : telemetryCompatible;
        if (gatewayRequestsSupportsErrorPayloadColumn !== false) return usageCompatible;
        const { error_payload: _omit, ...errorPayloadCompatible } = usageCompatible ?? {};
        return errorPayloadCompatible;
    };

    let lastError: unknown;
    const maxCompatibilityAttempts = 4;
    for (let attempt = 0; attempt < maxCompatibilityAttempts; attempt += 1) {
        try {
            const inserted = await attemptInsert(prepareCompatibleRow(row));
            if (gatewayRequestsSupportsErrorPayloadColumn === null && "error_payload" in row) {
                gatewayRequestsSupportsErrorPayloadColumn = true;
            }
            if (gatewayRequestsSupportsUsageColumns === null && "usage_total_tokens" in row) {
                gatewayRequestsSupportsUsageColumns = true;
            }
            if (gatewayRequestsSupportsTelemetryColumns === null && "provider_ttft_ms" in row) {
                gatewayRequestsSupportsTelemetryColumns = true;
            }
            return inserted;
        } catch (error) {
            lastError = error;
            let capabilityChanged = false;
            const telemetryColumns = [
                "provider_ttft_ms",
                "gateway_ttft_ms",
                "output_speed_tps",
                "tpot_ms",
                "itl_ms",
                "phaseo_overhead_ms",
            ];
            if (
                gatewayRequestsSupportsTelemetryColumns !== false &&
                telemetryColumns.some((column) => isMissingColumnError(error, column, "gateway_requests"))
            ) {
                gatewayRequestsSupportsTelemetryColumns = false;
                capabilityChanged = true;
            }
            if (
                gatewayRequestsSupportsUsageColumns !== false &&
                isMissingColumnError(error, "usage_", "gateway_requests")
            ) {
                gatewayRequestsSupportsUsageColumns = false;
                capabilityChanged = true;
            }
            if (
                "error_payload" in row &&
                gatewayRequestsSupportsErrorPayloadColumn !== false &&
                isMissingColumnError(error, "error_payload", "gateway_requests")
            ) {
                gatewayRequestsSupportsErrorPayloadColumn = false;
                capabilityChanged = true;
            }
            if (!capabilityChanged) throw error;
        }
    }

    throw lastError;
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
    providerModelSlug?: string | null;
    stream: boolean;
    byok: boolean;
    statusCode?: number | null;
    success: boolean;
    errorCode?: string | null;
    finishReason?: string | null;
    latencyMs?: number | null;
    generationMs?: number | null;
    providerTtftMs?: number | null;
    gatewayTtftMs?: number | null;
    outputSpeedTps?: number | null;
    tpotMs?: number | null;
    itlMs?: number | null;
    phaseoOverheadMs?: number | null;
    internalDispatchMs?: number | null;
    gatewayTotalMs?: number | null;
    throughput?: number | null;
    edgeColo?: string | null;
    edgeCountry?: string | null;
    edgeContinent?: string | null;
    sessionId?: string | null;
    endUserId?: string | null;
    authMethod?: "api_key" | "oauth" | null;
    nativeResponseId?: string | null;
    userAgent?: string | null;
    clientSource?: { id: string; name: string; kind: string; version: string | null; detection: string } | null;
    costNanos?: number | null;
    currency?: string | null;
    toolCallCount?: number | null;
    toolCallSucceeded?: boolean | null;
    toolCallValidation?: ToolCallValidation | null;
    structuredOutputAttempted?: boolean;
    structuredOutputSucceeded?: boolean;
    structuredOutputSuccessBasis?: StructuredOutputValidation["basis"];
    structuredOutputErrorReason?: StructuredOutputValidation["errorReason"];
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
    labels?: RequestLabel[] | null;
}) {
	const serviceTier = resolveAuditServiceTiers(args);
	const publicRoutedModel = (() => {
		const requested = args.requestedModel.trim();
		const routed = args.routedModel?.trim() ?? "";
		if (requested && routed && /(?::free|-free)$/i.test(requested)) {
			const base = (value: string) => value.replace(/(?::free|-free)$/i, "").toLowerCase();
			if (base(requested) === base(routed)) return requested;
		}
		return routed || null;
	})();
    const toProviderModelId = (provider: unknown, providerModelSlug: unknown): string | null => {
        const providerId = typeof provider === "string" ? provider.trim() : "";
        const modelSlug = typeof providerModelSlug === "string" ? providerModelSlug.trim() : "";
        return providerId && modelSlug ? `${providerId}:${modelSlug}` : null;
    };
    const factorKeys = [
        "success_rate",
        "latency_score",
        "tail_latency_score",
        "throughput_score",
        "price_score",
        "reliability_sample",
        "reliability_observations",
        "token_affinity",
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
            provider_model_id: toProviderModelId(attempt.provider, attempt.provider_model_slug),
            provider_api_model_id:
                typeof attempt.provider_model_slug === "string" ? attempt.provider_model_slug :
                typeof attempt.api_model_id === "string" ? attempt.api_model_id : null,
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
            const providerModelSlug = typeof entry.provider_model_slug === "string"
                ? entry.provider_model_slug
                : null;
            const providerApiModelId = typeof entry.provider_api_model_id === "string"
                ? (providerModelSlug
                    ? providerModelSlug
                    : entry.provider_api_model_id)
                : providerModelSlug;
            return {
                decision_order: index + 1,
                decision: "ranked",
                rank: Number.isFinite(Number(entry.rank)) ? Number(entry.rank) : index + 1,
                provider,
                provider_model_id: toProviderModelId(provider, entry.provider_model_slug),
                provider_api_model_id: providerApiModelId,
                score: Number.isFinite(Number(entry.score)) ? Number(entry.score) : null,
                selected: provider === args.provider && (
                    args.providerModelSlug
                        ? providerModelSlug === args.providerModelSlug
                        : !args.providerApiModelId || providerApiModelId === args.providerApiModelId
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
                score_trace: entry.score_trace && typeof entry.score_trace === "object"
                    ? entry.score_trace : {},
            };
        });
    const filterStages = Array.isArray((args.routingDiagnostics as any)?.filterStages)
        ? (args.routingDiagnostics as any).filterStages
        : [];
    const routingStageExclusions = filterStages.flatMap((stage: any) =>
        (Array.isArray(stage?.droppedProviders) ? stage.droppedProviders : []).map((entry: any) => ({
            decision_order: rankedDecisions.length + 1,
            decision: "excluded",
            rank: null,
            provider: typeof entry?.providerId === "string" ? entry.providerId : null,
            provider_model_id: toProviderModelId(entry?.providerId, entry?.providerModelSlug),
            provider_api_model_id:
                typeof entry?.apiModelId === "string" ? entry.apiModelId :
                typeof entry?.providerModelSlug === "string" ? entry.providerModelSlug : null,
            score: null,
            selected: false,
            attempted: false,
            exclusion_stage: typeof stage?.stage === "string" ? stage.stage : null,
            exclusion_reason: typeof entry?.reason === "string" ? entry.reason : null,
            score_factors: {},
            score_trace: {},
        }))
    );
    const workspacePolicy = (args.routingDiagnostics as any)?.workspacePolicy;
    const workspacePolicyDrops = [
        ...(Array.isArray(workspacePolicy?.droppedProviders) ? workspacePolicy.droppedProviders : []),
        ...(Array.isArray(workspacePolicy?.droppedByPrivacy) ? workspacePolicy.droppedByPrivacy : []),
    ];
    const seenExclusions = new Set(routingStageExclusions.map((entry: any) =>
        `${entry.provider ?? ""}::${entry.provider_api_model_id ?? ""}`
    ));
    const workspacePolicyExclusions = workspacePolicyDrops.flatMap((entry: any) => {
        const provider = typeof entry?.providerId === "string" ? entry.providerId : null;
        const providerApiModelId =
            typeof entry?.apiModelId === "string" ? entry.apiModelId :
            typeof entry?.providerModelSlug === "string" ? entry.providerModelSlug : null;
        const key = `${provider ?? ""}::${providerApiModelId ?? ""}`;
        if (!provider || seenExclusions.has(key)) return [];
        seenExclusions.add(key);
        return [{
            decision_order: rankedDecisions.length + 1,
            decision: "excluded",
            rank: null,
            provider,
            provider_model_id: toProviderModelId(provider, entry?.providerModelSlug),
            provider_api_model_id: providerApiModelId,
            score: null,
            selected: false,
            attempted: false,
            exclusion_stage: "workspace_policy",
            exclusion_reason: typeof entry?.reason === "string" ? entry.reason : "excluded_by_workspace_policy",
            score_factors: {},
            score_trace: {},
        }];
    });
    const excludedDecisions = [...routingStageExclusions, ...workspacePolicyExclusions]
        .slice(0, Math.max(0, 128 - rankedDecisions.length))
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
            routed_model_slug: publicRoutedModel,
            provider: args.provider ?? null,
            provider_model_id: toProviderModelId(args.provider, args.providerModelSlug),
            // The v2 catalogue resolves concrete provider/model routes by the
            // upstream-facing model slug, not the legacy provider-model row ID.
            provider_api_model_id: args.providerModelSlug ?? args.providerApiModelId ?? null,
            service_tier_requested: serviceTier.requested,
            service_tier_observed: serviceTier.observed,
            service_tier: serviceTier.effective,
            status_code: args.statusCode ?? null,
            success: args.success,
            error_code: args.errorCode ?? null,
            stop_reason: args.finishReason ?? null,
            stream: args.stream,
            byok: args.byok,
            latency_ms: args.latencyMs == null ? null : Math.max(0, Math.round(args.latencyMs)),
            generation_ms: args.generationMs == null ? null : Math.max(0, Math.round(args.generationMs)),
            provider_ttft_ms: positiveMetric(args.providerTtftMs, true),
            gateway_ttft_ms: positiveMetric(args.gatewayTtftMs, true),
            output_speed_tps: positiveMetric(args.outputSpeedTps),
            tpot_ms: positiveMetric(args.tpotMs),
            itl_ms: positiveMetric(args.itlMs),
            phaseo_overhead_ms: args.phaseoOverheadMs == null ? null : Math.max(0, args.phaseoOverheadMs),
            internal_dispatch_ms: args.internalDispatchMs == null ? null : Math.max(0, args.internalDispatchMs),
            gateway_total_ms: args.gatewayTotalMs == null ? null : Math.max(0, args.gatewayTotalMs),
            throughput: args.throughput == null ? null : Math.max(0, args.throughput),
            cloudflare_colo: args.edgeColo ? args.edgeColo.trim().toUpperCase() : null,
            session_id: args.sessionId ?? null,
            end_user_id: args.endUserId ?? null,
            auth_method: args.authMethod ?? null,
            native_response_id: args.nativeResponseId ?? null,
            user_agent: args.userAgent ?? null,
            sdk_name: args.clientSource?.kind === "sdk" || args.clientSource?.kind === "agent_sdk" ? args.clientSource.id : null,
            sdk_version: args.clientSource?.kind === "sdk" || args.clientSource?.kind === "agent_sdk" ? args.clientSource.version : null,
            client_version: args.clientSource?.version ?? null,
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
            routing_trace: {
                algorithm: (args.routingDiagnostics as any)?.algorithm ?? null,
                model: (args.routingDiagnostics as any)?.model ?? args.requestedModel,
                endpoint: (args.routingDiagnostics as any)?.endpoint ?? args.endpoint,
                priority: (args.routingDiagnostics as any)?.priority ?? null,
                routing_mode: (args.routingDiagnostics as any)?.routingMode ?? null,
                requested_routing: (args.routingDiagnostics as any)?.requestedRouting ?? null,
                sticky_routing: (args.routingDiagnostics as any)?.stickyRouting ?? null,
                final_candidate_count: (args.routingDiagnostics as any)?.finalCandidateCount ?? rankedDecisions.length,
            },
            safe_metadata: {
                provider: args.provider ?? null,
                routed_model: publicRoutedModel ?? args.requestedModel,
				service_tier_requested: serviceTier.requested,
				service_tier_observed: serviceTier.observed,
				service_tier: serviceTier.effective,
				labels: args.labels ?? [],
				cached_input_tokens_are_subset_of_input: cachedInputTokensAreSubset(args.usage),
                edge_country: args.edgeCountry ? args.edgeCountry.trim().toUpperCase() : null,
                edge_continent: args.edgeContinent ? args.edgeContinent.trim().toUpperCase() : null,
                client_source: args.clientSource ?? null,
                structured_output_success_basis: args.structuredOutputAttempted
                    ? (args.structuredOutputSuccessBasis ?? "unobserved")
                    : null,
                structured_output_error_reason: args.structuredOutputAttempted
                    ? (args.structuredOutputErrorReason ?? "none")
                    : null,
                tool_call_validation: args.toolCallValidation ?? null,
                downstream_disconnected: args.downstreamDisconnected === true,
                stream_cancellation_support: args.streamCancellationSupport ?? "unknown",
                stream_provider_billing_on_cancel: args.streamProviderBillingOnCancel ?? "unknown",
                stream_disconnect_action: args.streamDisconnectAction ?? null,
                performance: {
                    provider_ttft_ms: positiveMetric(args.providerTtftMs, true),
                    gateway_ttft_ms: positiveMetric(args.gatewayTtftMs, true),
                    output_speed_tps: positiveMetric(args.outputSpeedTps),
                    tpot_ms: positiveMetric(args.tpotMs),
                    itl_ms: positiveMetric(args.itlMs),
                    phaseo_overhead_ms: args.phaseoOverheadMs == null ? null : Math.max(0, Math.round(args.phaseoOverheadMs)),
                },
            },
    };
    const client = supaAdmin();
    const routingRpc = "ingest_v2_gateway_request_with_routing";
    const { error } = await client.rpc(routingRpc, { p_event: event });
    if (!error) return;
    if (!isMissingRpcError(error, routingRpc)) throw error;

    const { routing_decisions: _routingDecisions, routing_trace: _routingTrace, ...baseEvent } = event;
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
    providerTtftMs?: number | null; gatewayTtftMs?: number | null;
    outputSpeedTps?: number | null; tpotMs?: number | null;
    itlMs?: number | null; phaseoOverheadMs?: number | null;
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
    userAgent?: string | null;
    clientSource?: { id: string; name: string; kind: string; version: string | null; detection: string } | null;
    labels?: RequestLabel[] | null;
    detailMetadata?: Record<string, unknown> | null;
}) {
    const usageColumns = buildGatewayRequestUsageColumns({
        usage: args.usage ?? {},
        endpoint: args.endpoint,
        requestPayload: args.requestPayload,
        gatewayResponse: args.gatewayResponse,
    });

    const detailMetadata = {
        ...(args.detailMetadata ?? {}),
        labels: args.labels ?? args.detailMetadata?.labels ?? [],
        client_source: args.clientSource ?? null,
        request: {
            ...(
                args.detailMetadata?.request &&
                typeof args.detailMetadata.request === "object" &&
                !Array.isArray(args.detailMetadata.request)
                    ? args.detailMetadata.request as Record<string, unknown>
                    : {}
            ),
            user_agent: args.userAgent ?? null,
        },
    };

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
        provider_ttft_ms: positiveMetric(args.providerTtftMs, true),
        gateway_ttft_ms: positiveMetric(args.gatewayTtftMs, true),
        output_speed_tps: positiveMetric(args.outputSpeedTps),
        tpot_ms: positiveMetric(args.tpotMs),
        itl_ms: positiveMetric(args.itlMs),
        phaseo_overhead_ms: args.phaseoOverheadMs ?? null,
        usage: args.usage ?? {},
        ...usageColumns,
        ...(args.costNanos != null ? { cost_nanos: Math.round(args.costNanos as number) } : {}),
        currency: args.currency ?? null,
        pricing_lines: Array.isArray(args.pricingLines) ? args.pricingLines : [],
        key_id: args.keyId ?? null,
        throughput: args.throughput ?? null,
        finish_reason: args.finishReason ?? null,
        location: args.edgeColo ?? null,
        detail_metadata: detailMetadata,
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

function readToolCallCount(usage: unknown, finishReason?: string | null): number {
    const record = usage && typeof usage === "object" && !Array.isArray(usage)
        ? usage as Record<string, unknown>
        : {};
    const count = Number(record.output_tool_call_count ?? record.tool_call_count ?? 0);
    if (Number.isFinite(count) && count > 0) return Math.round(count);
    return finishReason === "tool_calls" || finishReason === "tool_use" ? 1 : 0;
}

export async function auditSuccess(input: {
    requestId: string; workspaceId: string;
    provider: string; model: string; requestedModel?: string; endpoint: Endpoint;
    providerApiModelId?: string | null;
    providerModelSlug?: string | null;
    stream: boolean; byok: boolean;
    labels?: RequestLabel[] | null;
    nativeResponseId?: string | null;
    appTitle?: string | null; referer?: string | null;
    appId?: string | null; appName?: string | null; appCategories?: string | null;
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
    clientSource?: { id: string; name: string; kind: string; version: string | null; detection: string } | null;
    clientIp?: string | null;
    cfRay?: string | null;
    edgeColo?: string | null;
    edgeCity?: string | null;
    edgeCountry?: string | null;
    edgeContinent?: string | null;
    edgeAsn?: number | null;
    generationMs?: number | null; latencyMs?: number | null;
    providerTtftMs?: number | null; gatewayTtftMs?: number | null;
    outputSpeedTps?: number | null; tpotMs?: number | null;
    itlMs?: number | null; phaseoOverheadMs?: number | null;
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
    const args = protectStealthAuditArgs(input);
    const releaseRuntime = ensureRuntimeForBackground();
    try {
        const pricingLines = args.usagePriced?.pricing?.lines ?? [];
        const strippedUsage = stripPricingFromUsage(args.usagePriced);
        const structuredOutput = validateStructuredOutputResponse(args.requestPayload, args.gatewayResponse);
        const toolCallValidation = validateToolCallResponses(args.requestPayload, args.gatewayResponse);
        const appId = await ensureAppId({
            workspaceId: args.workspaceId,
            appTitle: args.appTitle ?? null,
            referer: args.referer ?? null,
            appId: args.appId ?? null,
            appName: args.appName ?? null,
            appCategories: args.appCategories ?? null,
        });
        const hasExplicitAppAttribution = [args.appTitle, args.referer, args.appId, args.appName]
            .some((value) => String(value ?? "").trim().length > 0);
        if (!appId && hasExplicitAppAttribution) {
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
            providerTtftMs: args.providerTtftMs ?? null,
            gatewayTtftMs: args.gatewayTtftMs ?? null,
            outputSpeedTps: args.outputSpeedTps ?? null,
            tpotMs: args.tpotMs ?? null,
            itlMs: args.itlMs ?? null,
            phaseoOverheadMs: args.phaseoOverheadMs ?? null,
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
            userAgent: args.userAgent ?? null,
            clientSource: args.clientSource ?? null,
            labels: args.labels ?? null,
            detailMetadata: args.detailMetadata ?? null,
        });

        let supabaseError: Error | null = null;
        try {
            const insertedRow = await retryWithBackoff(
                () => insertGatewayRequest(row),
                "supabase_audit_success_insert",
            );
            await syncInsertedRequestRollup(insertedRow, "audit_success");
            await persistGatewayUpstreamRequests({
                insertedRow,
                requestId: args.requestId,
                workspaceId: args.workspaceId,
                appId,
                keyId: args.keyId ?? null,
                endpoint: args.endpoint,
                modelId: args.model,
                provider: args.provider,
                providerApiModelId: args.providerApiModelId ?? null,
                providerModelSlug: args.providerModelSlug ?? null,
                providerAttempts: args.providerAttempts ?? null,
                statusCode: args.statusCode,
                success: true,
                nativeResponseId: args.nativeResponseId ?? null,
                finishReason: args.finishReason ?? null,
                usage: strippedUsage,
                totalNanos: args.totalNanos ?? (
                    Number.isFinite(args.totalCents) ? Math.round(args.totalCents * 1e7) : null
                ),
                currency: args.currency,
                latencyMs: args.latencyMs ?? null,
                generationMs: args.generationMs ?? null,
                totalMs: args.endToEndMs ?? args.latencyMs ?? null,
                context: "audit_success",
            });
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
                    providerModelSlug: args.providerModelSlug ?? null,
                    stream: args.stream,
                    byok: args.byok,
                    statusCode: args.statusCode,
                    success: true,
                    finishReason: args.finishReason ?? null,
                    latencyMs: args.latencyMs ?? null,
                    generationMs: args.generationMs ?? null,
                    providerTtftMs: args.providerTtftMs ?? null,
                    gatewayTtftMs: args.gatewayTtftMs ?? null,
                    outputSpeedTps: args.outputSpeedTps ?? null,
                    tpotMs: args.tpotMs ?? null,
                    itlMs: args.itlMs ?? null,
                    phaseoOverheadMs: args.phaseoOverheadMs ?? null,
                    internalDispatchMs: args.internalLatencyMs ?? null,
                    gatewayTotalMs: args.endToEndMs ?? null,
                    throughput: args.throughput ?? null,
                    edgeColo: args.edgeColo ?? null,
                    edgeCountry: args.edgeCountry ?? null,
                    edgeContinent: args.edgeContinent ?? null,
                    sessionId: args.sessionId ?? null,
                    endUserId: args.requestUserId ?? null,
                    authMethod: args.authMethod ?? null,
                    nativeResponseId: args.nativeResponseId ?? null,
                    userAgent: args.userAgent ?? null,
                    clientSource: args.clientSource ?? null,
                    costNanos: args.totalNanos ?? (
                        Number.isFinite(args.totalCents)
                            ? Math.round(args.totalCents * 1e7)
                            : null
                    ),
                    currency: args.currency,
                    toolCallCount: Math.max(
                        readToolCallCount(strippedUsage, args.finishReason),
                        toolCallValidation.totalCalls,
                    ),
                    toolCallSucceeded: toolCallValidation.totalCalls > 0
                        ? toolCallValidation.invalidCalls === 0
                        : readToolCallCount(strippedUsage, args.finishReason) > 0 ? true : null,
                    toolCallValidation: toolCallValidation.totalCalls > 0 ? toolCallValidation : null,
                    structuredOutputAttempted: structuredOutput.attempted,
                    structuredOutputSucceeded: structuredOutput.succeeded,
                    structuredOutputSuccessBasis: structuredOutput.basis,
                    structuredOutputErrorReason: structuredOutput.errorReason,
                    downstreamDisconnected: args.downstreamDisconnected === true,
                    streamCancellationSupport: args.streamCancellationSupport ?? "unknown",
                    streamProviderBillingOnCancel: args.streamProviderBillingOnCancel ?? "unknown",
                    streamDisconnectAction: args.streamDisconnectAction ?? "drain_upstream",
                    usage: strippedUsage,
                    pricingLines,
                    requestPayload: args.requestPayload,
                    gatewayResponse: args.gatewayResponse,
                    providerAttempts: args.providerAttempts ?? null,
                    labels: args.labels ?? null,
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
    provider?: string | null;
    providerApiModelId?: string | null;
    providerModelSlug?: string | null;
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
    appCategories?: string | null;
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
    clientSource?: { id: string; name: string; kind: string; version: string | null; detection: string } | null;
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
    labels?: RequestLabel[] | null;
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
    providerModelSlug?: string | null;
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
    appCategories?: string | null;
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
    clientSource?: { id: string; name: string; kind: string; version: string | null; detection: string } | null;
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
    labels?: RequestLabel[] | null;
    usage?: Record<string, unknown> | null;
    currency?: string | null;
    pricingLines?: unknown[] | null;
};

export async function auditFailure(input: AuditFailureBefore | AuditFailureExecute) {
    const args = protectStealthAuditArgs(input);
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
                    appCategories: args.appCategories ?? null,
                })
                : null;
            const row = buildSupaRow({
                requestId: args.requestId,
                workspaceId: args.workspaceId ?? null,
                endpoint: args.endpoint,
                model: args.model ?? args.requestedModel ?? "unknown",
                canonicalModel: args.requestedModel ?? args.model ?? "unknown",
                provider: args.provider ?? null,
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
                userAgent: args.userAgent ?? null,
                clientSource: args.clientSource ?? null,
                labels: args.labels ?? null,
                detailMetadata: args.detailMetadata ?? null,
            });

            let supabaseError: Error | null = null;
            if (args.workspaceId) {
                try {
                    const insertedRow = await retryWithBackoff(
                        () => insertGatewayRequest(row),
                        "supabase_audit_failure_before_insert",
                    );
                    await syncInsertedRequestRollup(insertedRow, "audit_failure_before");
                    await persistGatewayUpstreamRequests({
                        insertedRow,
                        requestId: args.requestId,
                        workspaceId: args.workspaceId,
                        appId: resolvedAppId,
                        keyId: args.keyId ?? null,
                        endpoint: args.endpoint,
                        modelId: args.requestedModel ?? args.model ?? "unknown",
                        provider: args.provider ?? null,
                        providerApiModelId: args.providerApiModelId ?? null,
                        providerModelSlug: args.providerModelSlug ?? null,
                        providerAttempts: args.providerAttempts ?? null,
                        statusCode: args.statusCode,
                        success: false,
                        totalNanos: 0,
                        latencyMs: args.latencyMs ?? null,
                        totalMs: args.latencyMs ?? null,
                        context: "audit_failure_before",
                    });
                    let v2PersistenceError: Error | null = null;
                    try {
                        await retryWithBackoff(() => upsertV2RequestFact({
                            requestId: args.requestId,
                            workspaceId: args.workspaceId,
                            appId: resolvedAppId,
                            keyId: args.keyId ?? null,
                            endpoint: args.endpoint,
                            requestedModel: args.requestedModel ?? args.model ?? "unknown",
                            routedModel: args.model ?? args.requestedModel ?? null,
                            provider: args.provider ?? null,
                            providerApiModelId: args.providerApiModelId ?? null,
                            providerModelSlug: args.providerModelSlug ?? null,
                            stream: false,
                            byok: false,
                            statusCode: args.statusCode,
                            success: false,
                            errorCode: args.errorCode,
                            latencyMs: args.latencyMs ?? null,
                            internalDispatchMs: args.internalLatencyMs ?? null,
                            edgeColo: args.edgeColo ?? null,
                            edgeCountry: args.edgeCountry ?? null,
                            edgeContinent: args.edgeContinent ?? null,
                            sessionId: args.sessionId ?? null,
                            endUserId: args.requestUserId ?? null,
                            authMethod: args.authMethod ?? null,
                            userAgent: args.userAgent ?? null,
                            structuredOutputAttempted: isStructuredOutputRequest(args.requestPayload),
                            structuredOutputSucceeded: false,
                            requestPayload: args.requestPayload,
                            gatewayResponse: args.gatewayResponse,
                            providerAttempts: args.providerAttempts ?? null,
                            labels: args.labels ?? null,
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
                        provider: args.provider ?? null,
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
                            provider: args.provider ?? null,
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
            appCategories: args.appCategories ?? null,
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
            userAgent: args.userAgent ?? null,
            clientSource: args.clientSource ?? null,
            labels: args.labels ?? null,
            detailMetadata: args.detailMetadata ?? null,
        });

        let supabaseError: Error | null = null;
        if (args.workspaceId) {
            try {
                const insertedRow = await retryWithBackoff(
                    () => insertGatewayRequest(row),
                    "supabase_audit_failure_execute_insert",
                );
                await syncInsertedRequestRollup(insertedRow, "audit_failure_execute");
                await persistGatewayUpstreamRequests({
                    insertedRow,
                    requestId: args.requestId,
                    workspaceId: args.workspaceId,
                    appId: resolvedAppId,
                    keyId: args.keyId ?? null,
                    endpoint: args.endpoint,
                    modelId: args.model,
                    provider: args.provider ?? null,
                    providerApiModelId: args.providerApiModelId ?? null,
                    providerModelSlug: args.providerModelSlug ?? null,
                    providerAttempts: args.providerAttempts ?? null,
                    statusCode: args.statusCode,
                    success: false,
                    usage: args.usage ?? {},
                    totalNanos: 0,
                    currency: args.currency ?? null,
                    latencyMs: args.latencyMs ?? null,
                    generationMs: args.generationMs ?? null,
                    totalMs: args.latencyMs ?? null,
                    context: "audit_failure_execute",
                });
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
                        providerModelSlug: args.providerModelSlug ?? null,
                        stream: args.stream,
                        byok: args.byok === true,
                        statusCode: args.statusCode,
                        success: false,
                        errorCode: args.errorCode,
                        latencyMs: args.latencyMs ?? null,
                        generationMs: args.generationMs ?? null,
                        internalDispatchMs: args.internalLatencyMs ?? null,
                        edgeColo: args.edgeColo ?? null,
                        edgeCountry: args.edgeCountry ?? null,
                        edgeContinent: args.edgeContinent ?? null,
                        sessionId: args.sessionId ?? null,
                        endUserId: args.requestUserId ?? null,
                        authMethod: args.authMethod ?? null,
                        userAgent: args.userAgent ?? null,
                        clientSource: args.clientSource ?? null,
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
                        labels: args.labels ?? null,
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

