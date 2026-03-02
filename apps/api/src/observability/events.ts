// Purpose: Observability utilities for logging and analytics.
// Why: Keeps telemetry non-blocking and centralized.
// How: Sends structured events to Axiom with safe timeouts.

import type { PipelineContext } from "@pipeline/before/types";
import type { RequestResult } from "@pipeline/execute";
import { ensureRuntimeForBackground, getBindings } from "@/runtime/env";
import { sendAxiomWideEvent } from "./axiom";
import { sanitizeForAxiom, sanitizeJsonStringForAxiom, stringifyForAxiom } from "./privacy";

type EventArgs = {
    ctx?: PipelineContext;
    result?: RequestResult;
    provider?: string | null;
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
    keyId?: string | null;
    statusCode?: number | null;
    success: boolean;
    errorCode?: string | null;
    errorMessage?: string | null;
    errorType?: "system" | "user" | null;
    errorStage?: "before" | "execute" | null;
    internalReason?: string | null;
    internalCode?: string | null;
    unsupportedParam?: string | null;
    unsupportedParamPath?: string | null;
    errorDetails?: unknown;
    finishReason?: string | null;
    usage?: any;
    pricing?: {
        total_cents?: number | null;
        total_nanos?: number | null;
        currency?: string | null;
    } | null;
    protocolOverride?: string | null;
    requestId?: string | null;
    teamId?: string | null;
    model?: string | null;
    endpoint?: string | null;
    mappedRequest?: string | null;
    gatewayResponse?: unknown;
    providerResponse?: unknown;
    providerResponseHeaders?: Record<string, string> | null;
};

function toNum(value: any) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function usageSummary(usage: any) {
    if (!usage || typeof usage !== "object") return {};
    const input = usage.input_tokens ?? usage.prompt_tokens ?? usage.input_text_tokens ?? null;
    const output = usage.output_tokens ?? usage.completion_tokens ?? usage.output_text_tokens ?? null;
    const total = usage.total_tokens ?? (typeof input === "number" && typeof output === "number" ? input + output : null);
    const inputDetails = usage.input_tokens_details ?? usage.input_details ?? usage.prompt_tokens_details ?? {};
    const outputDetails = usage.output_tokens_details ?? usage.completion_tokens_details ?? {};
    return {
        usage_input_tokens: toNum(input),
        usage_output_tokens: toNum(output),
        usage_total_tokens: toNum(total),
        usage_request_tool_count: toNum(
            usage.request_tool_count ?? usage.requested_tool_count ?? null
        ),
        usage_request_tool_result_count: toNum(
            usage.request_tool_result_count ?? usage.tool_result_count ?? null
        ),
        usage_output_tool_call_count: toNum(
            usage.output_tool_call_count ?? usage.tool_call_count ?? null
        ),
        usage_input_images: toNum(
            usage.input_image_count ?? inputDetails.input_images ?? inputDetails.input_image_count ?? null
        ),
        usage_input_audio: toNum(
            usage.input_audio_count ?? inputDetails.input_audio ?? inputDetails.input_audio_count ?? null
        ),
        usage_input_video: toNum(
            usage.input_video_count ?? inputDetails.input_videos ?? inputDetails.input_video_count ?? null
        ),
        usage_output_images: toNum(
            usage.output_image_count ?? outputDetails.output_images ?? outputDetails.output_image_count ?? null
        ),
        usage_output_audio: toNum(
            usage.output_audio_count ?? outputDetails.output_audio ?? outputDetails.output_audio_count ?? null
        ),
        usage_output_video: toNum(
            usage.output_video_count ?? usage.output_video_seconds ?? outputDetails.output_videos ?? outputDetails.output_video_count ?? null
        ),
    };
}

function classifyErrorType(args: EventArgs): "system" | "user" | null {
    if (args.success) return null;
    if (args.errorType) return args.errorType;

    const code = String(args.errorCode ?? "").toLowerCase();
    const raw = code.includes(":") ? code.split(":").slice(1).join(":") : code;
    const status = Number(args.statusCode ?? 0);

    const userHints = [
        "invalid_json",
        "validation",
        "unsupported_param",
        "unsupported_model_or_endpoint",
        "unsupported_modalities",
        "bad_request",
        "missing_required",
    ];
    const systemHints = [
        "gateway",
        "no_key",
        "missing_api_key",
        "provider_key",
        "timeout",
        "overload",
        "rate_limit",
        "upstream",
        "breaker",
        "internal",
        "executor",
        "routing",
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

function countMediaFromContext(ctx?: PipelineContext): {
    inputImages: number | null;
    inputAudio: number | null;
    inputVideo: number | null;
} {
    if (!ctx?.rawBody || typeof ctx.rawBody !== "object") {
        return { inputImages: null, inputAudio: null, inputVideo: null };
    }

    let inputImages = 0;
    let inputAudio = 0;
    let inputVideo = 0;

    const inspect = (value: any) => {
        if (!value) return;
        if (Array.isArray(value)) {
            for (const item of value) inspect(item);
            return;
        }
        if (typeof value !== "object") return;

        const type = String(value.type ?? "").toLowerCase();
        if (type === "image_url" || type === "input_image") inputImages += 1;
        if (type === "input_audio" || type === "audio_url") inputAudio += 1;
        if (type === "input_video" || type === "video_url") inputVideo += 1;

        for (const nested of Object.values(value)) inspect(nested);
    };

    inspect((ctx.rawBody as any).messages ?? null);
    inspect((ctx.rawBody as any).input ?? null);
    inspect((ctx.rawBody as any).input_items ?? null);

    return {
        inputImages: inputImages > 0 ? inputImages : null,
        inputAudio: inputAudio > 0 ? inputAudio : null,
        inputVideo: inputVideo > 0 ? inputVideo : null,
    };
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

type RoutingDrop = {
    stage: string;
    providerId: string | null;
    reason: string | null;
};

type RoutingFailureSignals = {
    finalCandidateCount: number | null;
    statusGateBeforeCount: number | null;
    statusGateAfterCount: number | null;
    capabilityGateBeforeCount: number | null;
    capabilityGateAfterCount: number | null;
    filterStageCount: number | null;
    dropReasons: string[];
    droppedProviders: RoutingDrop[];
    providerStatusNotReadyProviders: string[];
};

type AttemptSignals = {
    attemptCount: number | null;
    attemptedProviders: string[];
    attemptFailureTypes: string[];
    attemptStatuses: number[];
    lastAttempt: Record<string, unknown> | null;
};

function getRoutingDiagnosticsFromArgs(args: EventArgs): any {
    const fromCtx = (args.ctx as any)?.routingDiagnostics;
    if (fromCtx && typeof fromCtx === "object") return fromCtx;
    const fromErrorDetails = (args.errorDetails as any)?.routing_diagnostics;
    if (fromErrorDetails && typeof fromErrorDetails === "object") return fromErrorDetails;
    const fromProviderResponse = (args.providerResponse as any)?.routing_diagnostics;
    if (fromProviderResponse && typeof fromProviderResponse === "object") return fromProviderResponse;
    return null;
}

export function extractRoutingFailureSignals(args: EventArgs): RoutingFailureSignals {
    const diagnostics = getRoutingDiagnosticsFromArgs(args);
    const stages = Array.isArray(diagnostics?.filterStages) ? diagnostics.filterStages : [];
    const statusStage = stages.find((stage: any) => stage?.stage === "status_gate");
    const capabilityStage = stages.find((stage: any) => stage?.stage === "capability_status_gate");

    const droppedProviders: RoutingDrop[] = [];
    for (const stage of stages) {
        const stageName = typeof stage?.stage === "string" ? stage.stage : "unknown";
        const dropped = Array.isArray(stage?.droppedProviders) ? stage.droppedProviders : [];
        for (const drop of dropped) {
            droppedProviders.push({
                stage: stageName,
                providerId: typeof drop?.providerId === "string" ? drop.providerId : null,
                reason: typeof drop?.reason === "string" ? drop.reason : null,
            });
        }
    }

    const dropReasonSet = new Set<string>();
    const providerStatusNotReadySet = new Set<string>();
    for (const drop of droppedProviders) {
        if (drop.reason) dropReasonSet.add(drop.reason);
        if (drop.reason === "provider_status_not_ready" && drop.providerId) {
            providerStatusNotReadySet.add(drop.providerId);
        }
    }

    return {
        finalCandidateCount:
            typeof diagnostics?.finalCandidateCount === "number"
                ? diagnostics.finalCandidateCount
                : null,
        statusGateBeforeCount:
            typeof statusStage?.beforeCount === "number" ? statusStage.beforeCount : null,
        statusGateAfterCount:
            typeof statusStage?.afterCount === "number" ? statusStage.afterCount : null,
        capabilityGateBeforeCount:
            typeof capabilityStage?.beforeCount === "number" ? capabilityStage.beforeCount : null,
        capabilityGateAfterCount:
            typeof capabilityStage?.afterCount === "number" ? capabilityStage.afterCount : null,
        filterStageCount: stages.length || null,
        dropReasons: Array.from(dropReasonSet.values()).sort(),
        droppedProviders,
        providerStatusNotReadyProviders: Array.from(providerStatusNotReadySet.values()).sort(),
    };
}

function getAttemptErrorsFromArgs(args: EventArgs): Array<Record<string, unknown>> {
    const fromCtx = (args.ctx as any)?.attemptErrors;
    if (Array.isArray(fromCtx)) return fromCtx as Array<Record<string, unknown>>;
    const fromErrorDetails = (args.errorDetails as any)?.attempt_errors;
    if (Array.isArray(fromErrorDetails)) return fromErrorDetails as Array<Record<string, unknown>>;
    const fromProviderResponse = (args.providerResponse as any)?.attempt_errors;
    if (Array.isArray(fromProviderResponse)) return fromProviderResponse as Array<Record<string, unknown>>;
    const fromFailureSample = (args.errorDetails as any)?.failure_sample;
    if (Array.isArray(fromFailureSample)) return fromFailureSample as Array<Record<string, unknown>>;
    return [];
}

function extractAttemptSignals(args: EventArgs): AttemptSignals {
    const attempts = getAttemptErrorsFromArgs(args);
    const providerSet = new Set<string>();
    const typeSet = new Set<string>();
    const statusSet = new Set<number>();
    for (const attempt of attempts) {
        const provider = typeof attempt?.provider === "string" ? attempt.provider : null;
        if (provider) providerSet.add(provider);
        const type = typeof attempt?.type === "string"
            ? attempt.type
            : (typeof attempt?.reason === "string" ? attempt.reason : null);
        if (type) typeSet.add(type);
        const status = Number(attempt?.status ?? NaN);
        if (Number.isFinite(status)) statusSet.add(status);
    }
    const lastAttempt = attempts.length ? (attempts[attempts.length - 1] ?? null) : null;
    return {
        attemptCount: attempts.length || null,
        attemptedProviders: Array.from(providerSet.values()).sort(),
        attemptFailureTypes: Array.from(typeSet.values()).sort(),
        attemptStatuses: Array.from(statusSet.values()).sort((a, b) => a - b),
        lastAttempt: lastAttempt && typeof lastAttempt === "object" ? lastAttempt : null,
    };
}

export async function emitGatewayRequestEvent(args: EventArgs) {
    const releaseRuntime = ensureRuntimeForBackground();
    try {
        const ctx = args.ctx;
        const bindings = getBindings();
        const requestId = args.requestId ?? ctx?.requestId ?? null;
        const teamId = args.teamId ?? ctx?.teamId ?? "unknown";
        if (!requestId) return;

        // Guard against duplicate wide-event emission for the same request context.
        if (ctx && requestId !== "unknown") {
            if ((ctx as any).__wideEventEmitted) return;
            (ctx as any).__wideEventEmitted = true;
        }

        const sanitizedGatewayRequest = ctx
            ? sanitizeForAxiom(ctx.rawBody ?? ctx.body ?? null)
            : null;
        const sanitizedUpstreamRequest = sanitizeJsonStringForAxiom(
            args.mappedRequest ?? args.result?.mappedRequest ?? null
        );
        const sanitizedErrorDetails = sanitizeForAxiom(args.errorDetails ?? null);
        const sanitizedProviderResponse = sanitizeForAxiom(
            args.providerResponse ?? args.result?.rawResponse ?? null
        );
        const sanitizedProviderResponseHeaders = sanitizeForAxiom(
            args.providerResponseHeaders ?? headersToRecord(args.result?.upstream?.headers)
        );
        const sanitizedGatewayResponse = sanitizeForAxiom(args.gatewayResponse ?? null);
        const sanitizedParamRoutingDiagnostics = sanitizeForAxiom(ctx?.paramRoutingDiagnostics ?? null);
        const sanitizedRoutingSnapshot = sanitizeForAxiom((ctx as any)?.routingSnapshot ?? null);
        const sanitizedRoutingDiagnostics = sanitizeForAxiom((ctx as any)?.routingDiagnostics ?? null);
        const sanitizedAttemptErrors = sanitizeForAxiom((ctx as any)?.attemptErrors ?? null);
        const sanitizedProviderEnablement = sanitizeForAxiom((ctx as any)?.providerEnablementDiagnostics ?? null);
        const sanitizedProviderCandidateBuild = sanitizeForAxiom((ctx as any)?.providerCandidateBuildDiagnostics ?? null);
        const requestedParams = Array.isArray(ctx?.requestedParams) ? ctx.requestedParams : [];
        const modelRequested = (() => {
            const fromCtxBody = (ctx?.rawBody as any)?.model;
            if (typeof fromCtxBody === "string" && fromCtxBody.length > 0) return fromCtxBody;
            const fromGatewayResponse = (args.gatewayResponse as any)?.model;
            if (typeof fromGatewayResponse === "string" && fromGatewayResponse.length > 0) return fromGatewayResponse;
            const fromErrorDetails = (args.errorDetails as any)?.model;
            if (typeof fromErrorDetails === "string" && fromErrorDetails.length > 0) return fromErrorDetails;
            return null;
        })();
        const modelResolved = args.model ?? ctx?.model ?? null;
        const providerCandidates = Array.isArray(ctx?.providers)
            ? ctx.providers.map((provider) => ({
                provider_id: provider.providerId ?? null,
                provider_status: provider.providerStatus ?? null,
                capability_status: provider.capabilityStatus ?? null,
                has_pricing: Boolean(provider.pricingCard),
            }))
            : null;
        const routingSignals = extractRoutingFailureSignals(args);
        const attemptSignals = extractAttemptSignals(args);
        const keyGate = ctx?.gating?.key ?? null;
        const keyLimitGate = ctx?.gating?.keyLimit ?? null;
        const creditGate = ctx?.gating?.credit ?? null;
        const generationContext = sanitizeForAxiom({
            model_requested: modelRequested,
            model_resolved: modelResolved,
            endpoint: args.endpoint ?? ctx?.endpoint ?? null,
            protocol: args.protocolOverride ?? ctx?.protocol ?? null,
            provider: args.result?.provider ?? args.provider ?? null,
            testing_mode: Boolean(ctx?.testingMode),
            provider_capabilities_beta: Boolean(ctx?.providerCapabilitiesBeta),
            team_settings: ctx?.teamSettings ?? null,
            gates: {
                key: keyGate,
                key_limit: keyLimitGate,
                credit: creditGate,
            },
            team_enrichment: ctx?.teamEnrichment ?? null,
            key_enrichment: ctx?.keyEnrichment ?? null,
            provider_candidates: providerCandidates,
            routing_diagnostics: getRoutingDiagnosticsFromArgs(args),
            routing_signals: routingSignals,
            attempt_signals: attemptSignals,
            attempt_errors: getAttemptErrorsFromArgs(args),
        });
        const mediaCounts = countMediaFromContext(ctx);
        const resolvedErrorType = classifyErrorType(args);

        const event = {
            event_type: "gateway.request",
            request_id: requestId,
            generation_id: requestId,
            team_id: teamId,
            protocol_in: args.protocolOverride ?? ctx?.protocol ?? null,
            app_title: args.appTitle ?? ctx?.meta?.appTitle ?? null,
            referer: args.referer ?? ctx?.meta?.referer ?? null,
            request_method: args.requestMethod ?? ctx?.meta?.requestMethod ?? null,
            request_path: args.requestPath ?? ctx?.requestPath ?? ctx?.meta?.requestPath ?? null,
            request_url: args.requestUrl ?? ctx?.meta?.requestUrl ?? null,
            user_agent: args.userAgent ?? ctx?.meta?.userAgent ?? null,
            client_ip: args.clientIp ?? ctx?.meta?.clientIp ?? null,
            cf_ray: args.cfRay ?? ctx?.meta?.cfRay ?? null,
            endpoint: args.endpoint ?? ctx?.endpoint ?? null,
            model: modelResolved,
            model_requested: modelRequested,
            model_resolved: modelResolved,
            stream: ctx?.stream ?? false,
            strictness: ctx?.strictness ?? null,
            testing_mode: Boolean(ctx?.testingMode),
            provider_capabilities_beta: Boolean(ctx?.providerCapabilitiesBeta),
            team_routing_mode: ctx?.teamSettings?.routingMode ?? null,
            team_beta_channel_enabled: ctx?.teamSettings?.betaChannelEnabled ?? null,
            team_byok_fallback_enabled: ctx?.teamSettings?.byokFallbackEnabled ?? null,
            team_billing_mode: ctx?.teamSettings?.billingMode ?? null,
            key_id: args.keyId ?? ctx?.meta?.apiKeyId ?? null,
            gate_key_ok: keyGate?.ok ?? null,
            gate_key_reason: keyGate?.reason ?? null,
            gate_key_limit_ok: keyLimitGate?.ok ?? null,
            gate_key_limit_reason: keyLimitGate?.reason ?? null,
            gate_credit_ok: creditGate?.ok ?? null,
            gate_credit_reason: creditGate?.reason ?? null,
            gate_credit_balance_nanos: creditGate?.balanceNanos ?? null,
            team_tier: (ctx?.teamEnrichment as any)?.tier ?? null,
            team_balance_nanos: (ctx?.teamEnrichment as any)?.balance_nanos ?? null,
            team_balance_usd: toNum((ctx?.teamEnrichment as any)?.balance_usd),
            team_spend_24h_nanos: toNum((ctx?.teamEnrichment as any)?.spend_24h_nanos),
            team_spend_24h_usd: toNum((ctx?.teamEnrichment as any)?.spend_24h_usd),
            key_daily_limit_pct: toNum((ctx?.keyEnrichment as any)?.daily_limit_pct),
            location: args.edgeColo ?? ctx?.meta?.edgeColo ?? null,
            edge_city: args.edgeCity ?? ctx?.meta?.edgeCity ?? null,
            edge_country: args.edgeCountry ?? ctx?.meta?.edgeCountry ?? null,
            edge_continent: args.edgeContinent ?? ctx?.meta?.edgeContinent ?? null,
            edge_asn: args.edgeAsn ?? ctx?.meta?.edgeAsn ?? null,
            status_code: args.statusCode ?? null,
            success: args.success,
            error_code: args.errorCode ?? null,
            error_message: args.errorMessage ?? null,
            error_type: resolvedErrorType,
            error_stage: args.errorStage ?? null,
            error_internal_reason: args.internalReason ?? null,
            error_internal_code: args.internalCode ?? null,
            error_unsupported_param: args.unsupportedParam ?? null,
            error_unsupported_param_path: args.unsupportedParamPath ?? null,
            error_details_redacted_json: stringifyForAxiom(sanitizedErrorDetails),
            provider: args.result?.provider ?? args.provider ?? null,
            chosen_surface: ctx?.endpoint ?? null,
            chosen_executor: ctx?.capability ?? null,
            provider_candidates_count: ctx?.providers?.length ?? null,
            provider_candidates_status_json: stringifyForAxiom(providerCandidates),
            attempt_count: attemptSignals.attemptCount,
            attempted_providers_count: attemptSignals.attemptedProviders.length || null,
            attempted_providers_json: stringifyForAxiom(attemptSignals.attemptedProviders),
            attempt_failure_types_json: stringifyForAxiom(attemptSignals.attemptFailureTypes),
            attempt_statuses_json: stringifyForAxiom(attemptSignals.attemptStatuses),
            attempt_last_json: stringifyForAxiom(sanitizeForAxiom(attemptSignals.lastAttempt)),
            requested_params_count: requestedParams.length || null,
            requested_params_json: stringifyForAxiom(requestedParams.length ? requestedParams : null),
            param_routing_provider_count_before: ctx?.paramRoutingDiagnostics?.providerCountBefore ?? null,
            param_routing_provider_count_after: ctx?.paramRoutingDiagnostics?.providerCountAfter ?? null,
            param_routing_dropped_provider_count: ctx?.paramRoutingDiagnostics?.droppedProviders?.length ?? null,
            param_routing_diagnostics_json: stringifyForAxiom(sanitizedParamRoutingDiagnostics),
            routing_candidates_json: stringifyForAxiom(sanitizedRoutingSnapshot),
            routing_diagnostics_json: stringifyForAxiom(sanitizedRoutingDiagnostics),
            routing_final_candidate_count: routingSignals.finalCandidateCount,
            routing_filter_stage_count: routingSignals.filterStageCount,
            routing_drop_reason_count: routingSignals.dropReasons.length || null,
            routing_drop_reasons_json: stringifyForAxiom(routingSignals.dropReasons),
            routing_dropped_providers_json: stringifyForAxiom(routingSignals.droppedProviders),
            routing_status_gate_before_count: routingSignals.statusGateBeforeCount,
            routing_status_gate_after_count: routingSignals.statusGateAfterCount,
            routing_capability_gate_before_count: routingSignals.capabilityGateBeforeCount,
            routing_capability_gate_after_count: routingSignals.capabilityGateAfterCount,
            routing_provider_status_not_ready_count: routingSignals.providerStatusNotReadyProviders.length || null,
            routing_provider_status_not_ready_providers_json: stringifyForAxiom(
                routingSignals.providerStatusNotReadyProviders
            ),
            error_is_provider_status_not_ready:
                routingSignals.providerStatusNotReadyProviders.length > 0,
            attempt_errors_json: stringifyForAxiom(sanitizedAttemptErrors),
            provider_enablement_diagnostics_json: stringifyForAxiom(sanitizedProviderEnablement),
            provider_candidate_build_diagnostics_json: stringifyForAxiom(sanitizedProviderCandidateBuild),
            latency_ms: toNum(ctx?.meta?.latency_ms),
            generation_ms: toNum(ctx?.meta?.generation_ms),
            internal_latency_ms: toNum((ctx as any)?.timing?.internal_latency_ms),
            throughput_tps: toNum(ctx?.meta?.throughput_tps),
            timing_json: ctx?.timing ? JSON.stringify(ctx.timing) : null,
            finish_reason: args.finishReason ?? null,
            ...usageSummary(args.usage),
            request_input_images: mediaCounts.inputImages,
            request_input_audio: mediaCounts.inputAudio,
            request_input_video: mediaCounts.inputVideo,
            cost_total_cents: toNum(args.pricing?.total_cents),
            cost_total_nanos: toNum(args.pricing?.total_nanos),
            cost_currency: args.pricing?.currency ?? null,
            request_payload_redacted_json: stringifyForAxiom(sanitizedGatewayRequest),
            upstream_request_redacted_json: stringifyForAxiom(sanitizedUpstreamRequest),
            provider_response_redacted_json: stringifyForAxiom(sanitizedProviderResponse),
            provider_response_headers_json: stringifyForAxiom(sanitizedProviderResponseHeaders),
            provider_status_code: args.result?.upstream?.status ?? args.statusCode ?? null,
            provider_status_text: args.result?.upstream?.statusText ?? null,
            provider_url: args.result?.upstream?.url ?? null,
            gateway_response_redacted_json: stringifyForAxiom(sanitizedGatewayResponse),
            generation_context_json: stringifyForAxiom(generationContext),
            transform_has_upstream_request: Boolean(args.mappedRequest ?? args.result?.mappedRequest),
            env: bindings.NODE_ENV ?? null,
            gateway_version: bindings.NEXT_PUBLIC_GATEWAY_VERSION ?? null,
        };

        await sendAxiomWideEvent(event);
    } finally {
        releaseRuntime();
    }
}

