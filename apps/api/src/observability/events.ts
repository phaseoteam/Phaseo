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
        const sanitizedParamRoutingDiagnostics = sanitizeForAxiom(ctx?.paramRoutingDiagnostics ?? null);
        const sanitizedRoutingSnapshot = sanitizeForAxiom((ctx as any)?.routingSnapshot ?? null);
        const sanitizedRoutingDiagnostics = sanitizeForAxiom((ctx as any)?.routingDiagnostics ?? null);
        const sanitizedAttemptErrors = sanitizeForAxiom((ctx as any)?.attemptErrors ?? null);
        const sanitizedProviderEnablement = sanitizeForAxiom((ctx as any)?.providerEnablementDiagnostics ?? null);
        const sanitizedProviderCandidateBuild = sanitizeForAxiom((ctx as any)?.providerCandidateBuildDiagnostics ?? null);
        const requestedParams = Array.isArray(ctx?.requestedParams) ? ctx.requestedParams : [];
        const mediaCounts = countMediaFromContext(ctx);
        const resolvedErrorType = classifyErrorType(args);

        const event = {
            event_type: "gateway.request",
            request_id: requestId,
            team_id: teamId,
            protocol_in: args.protocolOverride ?? ctx?.protocol ?? null,
            request_path: ctx?.requestPath ?? null,
            endpoint: args.endpoint ?? ctx?.endpoint ?? null,
            model: args.model ?? ctx?.model ?? null,
            stream: ctx?.stream ?? false,
            strictness: ctx?.strictness ?? null,
            location: ctx?.meta?.edgeColo ?? null,
            edge_city: ctx?.meta?.edgeCity ?? null,
            edge_country: ctx?.meta?.edgeCountry ?? null,
            edge_continent: ctx?.meta?.edgeContinent ?? null,
            edge_asn: ctx?.meta?.edgeAsn ?? null,
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
            provider: args.result?.provider ?? null,
            chosen_surface: ctx?.endpoint ?? null,
            chosen_executor: ctx?.capability ?? null,
            provider_candidates_count: ctx?.providers?.length ?? null,
            requested_params_count: requestedParams.length || null,
            requested_params_json: stringifyForAxiom(requestedParams.length ? requestedParams : null),
            param_routing_provider_count_before: ctx?.paramRoutingDiagnostics?.providerCountBefore ?? null,
            param_routing_provider_count_after: ctx?.paramRoutingDiagnostics?.providerCountAfter ?? null,
            param_routing_dropped_provider_count: ctx?.paramRoutingDiagnostics?.droppedProviders?.length ?? null,
            param_routing_diagnostics_json: stringifyForAxiom(sanitizedParamRoutingDiagnostics),
            routing_candidates_json: stringifyForAxiom(sanitizedRoutingSnapshot),
            routing_diagnostics_json: stringifyForAxiom(sanitizedRoutingDiagnostics),
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
            transform_has_upstream_request: Boolean(args.mappedRequest ?? args.result?.mappedRequest),
            env: bindings.NODE_ENV ?? null,
            gateway_version: bindings.NEXT_PUBLIC_GATEWAY_VERSION ?? null,
        };

        await sendAxiomWideEvent(event);
    } finally {
        releaseRuntime();
    }
}

