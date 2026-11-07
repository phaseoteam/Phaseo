// lib/gateway/after/stream.ts
// Purpose: After-stage logic for payload shaping, pricing, auditing, and streaming.
// Why: Keeps post-execution side-effects consistent.
// How: Wraps streaming responses and finalizes usage.

import { passthroughWithPricing, passthrough } from "./streaming";
import { createToolCallKeyResolver, type UnifiedStreamEvent } from "./stream-events";
import { createChatChunkAccumulator, resolveChatStreamAuditResponse } from "./chat-stream-log-snapshot";
import { createMessagesEventAccumulator, resolveMessagesStreamAuditResponse } from "./messages-stream-log-snapshot";
import type { PipelineContext } from "../before/types";
import type { RequestResult, Bill } from "../execute";
import type { PriceCard } from "../pricing";
import { calculatePricing } from "./pricing";
import { handleFailureAudit, handleSuccessAudit } from "./audit";
import { keepChargedTotalAsFinal, recordProvisionalStreamCharge, recordUsageAndChargeOnce } from "./charge";
import { estimateDrainProgressUsage } from "./drain-progress";
import {
    countRequestMediaInputs,
    shapeUsageForClient,
    stripUsagePricing,
    type RequestMediaCounts,
} from "../usage";
import { normalizeAnthropicUsage, presentUsageForClient, extractFinishReason, usageCostFields } from "./payload";
import {
	classifyProviderHealthImpact,
	onCallEnd,
	reportProbeResult,
	maybeOpenOnRecentErrors,
} from "../execute/health";
import { promptTokensFromUsage } from "../execute/routing-cost";
import { getBaseModel } from "../execute/utils";
import { droppedParamsForClient, twelveHourCacheDroppedFor } from "../execute/unsupportedParams";
import { noteModelSubstitutionServed } from "../before/modelSuccessor";
import { withServedModel } from "./served-model";
import { logDebugEvent, previewValue } from "../debug";
import { dispatchBackground, ensureRuntimeForBackground } from "@/runtime/env";
import { normalizeFinishReason } from "../audit/normalize-finish-reason";
import { CLIENT_CLOSED_REQUEST_STATUS, streamHealthSignals } from "../execute/attempt-health";
import { applyByokServiceFeeWithToolCharges } from "../pricing/byok-tool-charges";
import { applyDataContributionDiscount } from "../pricing/data-contribution-discount";
import {
    attachToolUsageMetrics,
    collectOutputToolCallNamesFromPayload,
    collectRequestedToolNames,
    countOutputToolCallsFromPayload,
    countRequestedTools,
    countRequestedToolResults,
} from "./tool-usage";
import {
    maybeWriteStickyRoutingFromUsage,
    resolveCacheAwareRoutingPreference,
} from "../execute/sticky-routing";
import { applyResponsePlugins } from "@/plugins/registry";
import { applySuccessfulResponseBillingPolicy, suppressFailedResponseBilling } from "./billing-policy";
import { calculateOutputPerformanceMetrics, getUsageReasoningTokens } from "./performance-metrics";
import { resolveFailoverMs, resolveOutputSpeedWindow } from "./timing";
import { recordManagedProviderTokensOnce } from "@core/provider-rate-limits";
import { chargeRateLimitPolicyTokens } from "@core/rate-limit-policies";
import { mergeMessagesStreamUsage } from "@core/usage-normalization";
import { alertUnexpectedZeroCostMedia } from "./media-zero-cost";

function shouldAttachRoutingDiagnostics(ctx: PipelineContext): boolean {
	return Boolean(ctx.meta?.debug?.enabled || ctx.meta?.returnRoutingDiagnostics);
}

function getStreamTerminalPayload(frame: any): any | null {
    if (!frame || typeof frame !== "object") return null;
    if (frame.object === "response" || frame.object === "chat.completion") {
        return frame;
    }
    if (
        frame.response &&
        typeof frame.response === "object" &&
        (frame.response.object === "response" || frame.response.object === "chat.completion")
    ) {
        return frame.response;
    }
    return null;
}

const INPUT_MODALITY_TOKEN_METERS = ["input_image_tokens", "input_audio_tokens", "input_video_tokens"] as const;
// Raw OpenAI Chat usage names its audio token counts inside the details objects
// (https://platform.openai.com/docs/api-reference/chat/object).
const OPENAI_CHAT_AUDIO_TOKEN_PATHS = [
    ["input_audio_tokens", "prompt_tokens_details"],
    ["output_audio_tokens", "completion_tokens_details"],
] as const;

/**
 * Client shaping keeps modality counts only inside input_tokens_details, where they can also
 * be counts of media parts. Carry the executor's token meters to pricing as meters, and the
 * audio token counts of raw OpenAI Chat usage (a passed-through stream has no executor meters).
 * Claude's `inference_geo` is carried too: price rows for US-only inference match on it.
 */
function withInputModalityTokenMeters(shaped: any, raw: any): any {
    if (!shaped || typeof shaped !== "object" || !raw || typeof raw !== "object") return shaped;
    const meters: Record<string, number | string> = {};
    if (typeof raw.inference_geo === "string" && shaped.inference_geo == null) meters.inference_geo = raw.inference_geo;
    for (const key of INPUT_MODALITY_TOKEN_METERS) {
        const value = raw[key];
        if (typeof value === "number" && Number.isFinite(value) && value > 0 && shaped[key] == null) meters[key] = value;
    }
    for (const [meter, detailsKey] of OPENAI_CHAT_AUDIO_TOKEN_PATHS) {
        const value = raw[meter] ?? raw[detailsKey]?.audio_tokens;
        if (typeof value === "number" && Number.isFinite(value) && value > 0 && shaped[meter] == null && meters[meter] == null) {
            meters[meter] = value;
        }
    }
    return Object.keys(meters).length ? { ...shaped, ...meters } : shaped;
}

function hasBillableTokenUsage(usage: any): boolean {
    if (!usage || typeof usage !== "object") return false;
    return ["input_tokens", "output_tokens", "cached_read_text_tokens", "cached_write_text_tokens"]
        .some((key) => typeof usage[key] === "number" && usage[key] > 0);
}

function getUsageOutputTokens(usage: any): number {
    if (!usage || typeof usage !== "object") return 0;
    const value =
        usage.completion_tokens ??
        usage.output_tokens ??
        usage.output_text_tokens ??
        usage.outputTokens ??
        usage.output_tokens_total ??
        usage.output ??
        0;
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function attachStreamTimingMeta(args: {
    ctx: PipelineContext;
    frame: any;
    usage: any;
}) {
    const { ctx, frame, usage } = args;
    if (!frame || typeof frame !== "object") return;
    if (typeof ctx.meta.generation_ms !== "number") return;

    const generationMs = ctx.meta.generation_ms;
    const tokensOut = getUsageOutputTokens(usage);
    const calculated = calculateOutputPerformanceMetrics({
        outputTokens: tokensOut,
        reasoningTokens: ctx.meta.reasoningStreamed ? null : getUsageReasoningTokens(usage),
        providerDurationMs: generationMs,
        providerTtftMs: ctx.meta.provider_ttft_ms ?? null,
        gatewayE2eMs: ctx.meta.end_to_end_ms ?? null,
        failoverMs: resolveFailoverMs(ctx),
        outputArrivals: ctx.meta.outputArrivals ?? null,
        speedWindow: resolveOutputSpeedWindow(ctx),
    });
    const throughputTps = calculated.effectiveThroughputTps;
    ctx.meta.throughput_tps = throughputTps ?? undefined;
    ctx.meta.output_speed_tps ??= calculated.outputSpeedTps ?? undefined;
    ctx.meta.tpot_ms ??= calculated.tpotMs ?? undefined;
    ctx.meta.itl_ms ??= calculated.itlMs ?? undefined;
    ctx.meta.phaseo_overhead_ms ??= calculated.phaseoOverheadMs ?? undefined;

    frame.meta = {
        ...frame.meta,
        throughput_tps: throughputTps,
        output_speed_tps: ctx.meta.output_speed_tps ?? null,
        generation_ms: generationMs,
		latency_ms: ctx.meta.latency_ms ?? null,
        provider_ttft_ms: ctx.meta.provider_ttft_ms ?? null,
        gateway_ttft_ms: ctx.meta.gateway_ttft_ms ?? null,
        tpot_ms: ctx.meta.tpot_ms ?? null,
        itl_ms: ctx.meta.itl_ms ?? null,
        phaseo_overhead_ms: ctx.meta.phaseo_overhead_ms ?? null,
        end_to_end_ms: ctx.meta.end_to_end_ms ?? null,
    };
    const responsePayload =
        frame.response &&
        typeof frame.response === "object" &&
        frame.response.object === "response"
            ? frame.response
            : frame.object === "response"
                ? frame
                : null;
    if (responsePayload) {
        responsePayload.metadata = {
            ...(responsePayload.metadata && typeof responsePayload.metadata === "object"
                ? responsePayload.metadata
                : {}),
			latency_ms: ctx.meta.latency_ms ?? null,
            generation_ms: generationMs,
            end_to_end_ms: ctx.meta.end_to_end_ms ?? null,
            throughput_tps: throughputTps,
            output_speed_tps: ctx.meta.output_speed_tps ?? null,
            provider_ttft_ms: ctx.meta.provider_ttft_ms ?? null,
            gateway_ttft_ms: ctx.meta.gateway_ttft_ms ?? null,
            tpot_ms: ctx.meta.tpot_ms ?? null,
            itl_ms: ctx.meta.itl_ms ?? null,
            phaseo_overhead_ms: ctx.meta.phaseo_overhead_ms ?? null,
        };
    }
    if (frame.meta && typeof frame.meta === "object" && "finish_reason" in frame.meta) {
        delete (frame.meta as Record<string, unknown>).finish_reason;
    }
}

export async function handleStreamResponse(
    ctx: PipelineContext,
    result: RequestResult,
    card: PriceCard | null,
    timingHeader?: string
): Promise<Response> {
    const upstream = result.kind === "stream" && result.stream
        ? new Response(result.stream, {
              status: result.upstream.status,
              headers: result.upstream.headers,
          })
        : result.upstream;

    const upstreamStatus = result.upstream.status;
    const cacheAwareRoutingEnabled = resolveCacheAwareRoutingPreference(
        ctx.body,
        typeof ctx.teamSettings?.cacheAwareRoutingEnabled === "boolean"
            ? ctx.teamSettings.cacheAwareRoutingEnabled
            : true
    );
    const stickyRoutingModel = getBaseModel(ctx.model);
    // The provider's response ID, from the first frame that names one. Re-encoded frames
    // already carry the request ID, which is never the native one.
    let cachedNativeId: string | undefined;
    const rememberNativeId = (frame: any) => {
        if (cachedNativeId || !frame || typeof frame !== "object") return;
        cachedNativeId = [frame.nativeResponseId, frame.response?.nativeResponseId, frame.response?.id, frame.message?.id, frame.id]
            .find((value) => typeof value === "string" && value.length > 0 && value !== ctx.requestId);
    };
    let cachedFinishReason: string | null = null;
    let latestStreamUsageRaw: any = null;
    let latestGatewaySnapshot: any = null;
    const chatChunkAccumulator = ctx.endpoint === "chat.completions" ? createChatChunkAccumulator() : null;
    const messagesEventAccumulator = ctx.endpoint === "messages" ? createMessagesEventAccumulator() : null;
    const auditGatewayResponse = () =>
        chatChunkAccumulator
            ? resolveChatStreamAuditResponse(latestGatewaySnapshot, chatChunkAccumulator)
            : messagesEventAccumulator
                ? resolveMessagesStreamAuditResponse(latestGatewaySnapshot, messagesEventAccumulator)
                : latestGatewaySnapshot;
	let streamFailed = false;
    let appliedStreamResponsePlugins = false;
    const streamedToolCallKeys = new Set<string>();
    const resolveStreamedToolCallKey = createToolCallKeyResolver();
    const streamedToolCallNames = new Set<string>();
    const requestedToolCount = countRequestedTools(ctx.body);
    const requestedToolNames = collectRequestedToolNames(ctx.body);
    const requestedToolResultCount = countRequestedToolResults(ctx.body);
    let cachedOutputToolCallCount: number | null = null;
    let cachedOutputToolCallNames: string[] | null = null;
    const buildToolUsage = () => ({
        request_tool_count: requestedToolCount > 0 ? requestedToolCount : null,
        request_tool_result_count: requestedToolResultCount > 0 ? requestedToolResultCount : null,
        output_tool_call_count: cachedOutputToolCallCount,
        request_tool_names: requestedToolNames.length > 0 ? requestedToolNames : null,
        output_tool_call_names: cachedOutputToolCallNames,
    });
    const withProviderHint = (usage: any) => {
        if (!usage || typeof usage !== "object") return usage;
        return {
            ...usage,
            _provider_id: result.provider,
        };
    };
    // Usage is shaped several times per stream (usage frames, the final
    // snapshot, finalization and re-pricing); walk the request body for media
    // inputs once per request instead of on every call.
    let requestMediaCounts: RequestMediaCounts | null | undefined;
    const shapeStreamUsageForClient = (usage: any) => {
        if (!usage || typeof usage !== "object") return usage;
        if (requestMediaCounts === undefined) {
            requestMediaCounts = countRequestMediaInputs(ctx.endpoint, ctx.body);
        }
        return shapeUsageForClient(withProviderHint(usage), {
            endpoint: ctx.endpoint,
            body: ctx.body,
            mediaCounts: requestMediaCounts,
        });
    };
    // Usage frames carry what settlement will charge. They are priced from the usage that
    // settlement bills: an authoritative executor's own reading of the upstream stream when
    // there is one (transformed frames can omit cache writes, modality tokens and server-tool
    // requests), otherwise the frame's own usage. The zero-output waiver and the data-sharing
    // discount are then applied as at settlement. Where the charge is not known yet, frames
    // carry no `cost`: a BYOK request's service fee is only worked out when the stream
    // settles, so its frames give the price as the provider's cost on the customer's key
    // instead; a stream that has already failed is not charged; and when the usage
    // settlement bills cannot be priced, settlement cannot charge it as priced either.
    const streamIsByok = (result?.keySource ?? ctx.meta.keySource) === "byok";
    const streamHasFailed = () => classifyProviderHealthImpact({
        upstreamStatus: result.upstream.status,
        credentialSource: result.keySource,
        midStreamError: streamFailed,
        finishReason: cachedFinishReason ?? result.bill.finish_reason ?? null,
    }) === "failure";
    const withStreamCostBasis = <T>(usage: T, costKnown: boolean): T => {
        const record = usage as any;
        if (!record || typeof record !== "object" || typeof record.cost !== "number") return usage;
        const { cost, cost_details, ...rest } = record;
        if (!costKnown) return rest as T;
        if (!streamIsByok) return usage;
        return { ...rest, cost_details: { ...(cost_details ?? {}), upstream_inference_cost: cost } } as T;
    };
    // Mirrors the authoritative branch of finalizeFromBill below.
    const authoritativeUsageForFrame = () => {
        if (!result.usageFinalizerAuthoritative || typeof result.usageSnapshot !== "function") return null;
        const snapshot = result.usageSnapshot();
        if (!hasBillableTokenUsage(snapshot)) return null;
        const meters = attachToolUsageMetrics(stripUsagePricing(snapshot), buildToolUsage());
        return withInputModalityTokenMeters(shapeStreamUsageForClient(meters), meters);
    };
    // Prices a frame's shaped usage. The priced usage keeps the frame's own token counts and
    // carries the settled charge as its `pricing`.
    const priceStreamFrameUsage = (shapedUsage: any): { pricedUsage: any; costKnown: boolean } => {
        const tier = ctx.teamEnrichment?.tier ?? 'basic';
        const priced = calculatePricing(shapedUsage, card, ctx.body, tier, ctx.meta);
        let basis = priced;
        try {
            const billed = authoritativeUsageForFrame();
            if (billed) basis = calculatePricing(billed, card, ctx.body, tier, ctx.meta);
        } catch {
            return { pricedUsage: priced.pricedUsage, costKnown: false };
        }
        let settled = basis.pricedUsage;
        if (!streamIsByok) {
            const successful = applySuccessfulResponseBillingPolicy({
                endpoint: ctx.endpoint,
                pricedUsage: attachToolUsageMetrics(basis.pricedUsage, buildToolUsage()),
                totalNanos: basis.totalNanos,
                totalCents: basis.totalCents,
            });
            settled = applyDataContributionDiscount({
                pricedUsage: successful.pricedUsage,
                totalNanos: successful.totalNanos,
                enabled: ctx.teamSettings?.dataContributionEnabled === true,
                isByok: false,
                discountBps: ctx.teamSettings?.dataContributionDiscountBps,
            }).pricedUsage;
        }
        const pricing = settled?.pricing;
        return {
            pricedUsage: pricing && typeof pricing === "object" ? { ...priced.pricedUsage, pricing } : priced.pricedUsage,
            costKnown: !streamHasFailed(),
        };
    };
    // Native Messages streams split usage: message_start carries input and cache tokens and
    // message_delta usually only output tokens. Merge them as the stream's final bill does.
    let messagesStreamUsage: Record<string, unknown> | null = null;
    const accumulateMessagesStreamUsage = (usage: any) => {
        if (!usage || typeof usage !== "object") return;
        messagesStreamUsage = mergeMessagesStreamUsage(messagesStreamUsage, usage);
    };
    // Messages usage frames are not otherwise priced for the client: add only the cost
    // fields, priced the same way as the Chat and Responses usage frames.
    const messagesStreamCostFields = (usage: any) => {
        if (!card || !usage || typeof usage !== "object") return undefined;
        try {
            const { pricedUsage, costKnown } = priceStreamFrameUsage(shapeStreamUsageForClient(usage));
            return withStreamCostBasis(usageCostFields((pricedUsage as any)?.pricing), costKnown);
        } catch {
            // Cost is informational on the frame; settlement prices the request separately.
            return undefined;
        }
    };
    if (ctx.meta?.debug) {
        void logDebugEvent("stream.start", {
            requestId: ctx.requestId,
            endpoint: ctx.endpoint,
            provider: result.provider,
            upstreamStatus,
            mappedRequest: previewValue(result.mappedRequest),
        });
    }

    // Output streamed so far, for settling a stream charged at drain checkpoints.
    let streamedOutputChars = 0;
    const onStreamEvent = (event: UnifiedStreamEvent) => {
		if (event.type === "error") {
			streamFailed = true;
		}
		if (event.type === "delta_text") streamedOutputChars += event.text.length;
		else if (event.type === "delta_tool") streamedOutputChars += event.argumentsDelta?.length ?? 0;
        // Sees the provider's own frame, also when it is re-encoded for the client.
        if (event.type === "start") rememberNativeId(event.payload);
        if (event.type === "delta_tool") {
            const key = resolveStreamedToolCallKey(event);
            streamedToolCallKeys.add(key);
            cachedOutputToolCallCount = streamedToolCallKeys.size;
            if (event.toolName) {
                streamedToolCallNames.add(event.toolName);
                cachedOutputToolCallNames = Array.from(streamedToolCallNames);
            }
            return;
        }

        if (event.type === "stop" && event.finishReason) {
            cachedFinishReason = normalizeFinishReason(event.finishReason, result.provider);
            result.bill.finish_reason = cachedFinishReason;
        }
    };

    // Prices the final bill. A throw (an unpriced meter in the final usage) is marked, so the
    // finalization catch keeps a stepped request's charged total as its final.
    const priceFinal = <T>(price: () => T): T => {
        try {
            return price();
        } catch (error) {
            (ctx.meta as Record<string, unknown>).__finalPricingFailed = true;
            throw error;
        }
    };
    // Prices a drained stream's progress: provider-reported usage where there is any, output
    // never below the streamed text. Null when there is nothing to charge or no price card.
    const priceDrainProgress = (progress: { usage: any; outputChars: number }) => {
        if (!card) return null;
        const estimated = estimateDrainProgressUsage({
            usage: authoritativeUsageForFrame() ?? progress.usage,
            outputChars: progress.outputChars,
        });
        if (!estimated) return null;
        const tier = ctx.teamEnrichment?.tier ?? 'basic';
        const priced = calculatePricing(
            withInputModalityTokenMeters(shapeStreamUsageForClient(estimated.usage), estimated.usage),
            card,
            ctx.body,
            tier,
            ctx.meta
        );
        const { totalNanos } = applyDataContributionDiscount({
            pricedUsage: priced.pricedUsage,
            totalNanos: priced.totalNanos,
            enabled: ctx.teamSettings?.dataContributionEnabled === true,
            isByok: false,
            discountBps: ctx.teamSettings?.dataContributionDiscountBps,
        });
        return { totalNanos, inputReported: estimated.inputReported };
    };

    const resp = await passthroughWithPricing({
        upstream,
        ctx,
        provider: result.provider,
        priceCard: card,
        rewriteFrame: (frame: any) => {
            if (!frame || typeof frame !== "object") return frame;
            chatChunkAccumulator?.add(frame);
            messagesEventAccumulator?.add(frame);
            const includeMeta = ctx.meta.returnMeta ?? false;
            const next: any = withServedModel({ ...frame }, ctx);
            delete next.provider;
            delete next.gateway;

            if (ctx.endpoint === "chat.completions" || ctx.endpoint === "responses") {
                rememberNativeId(next);
                if (ctx.endpoint === "chat.completions" && !next.nativeResponseId && cachedNativeId) {
                    next.nativeResponseId = cachedNativeId;
                }
                next.id = ctx.requestId;
                // Responses events nest the response object; it gets the same IDs as the
                // buffered body: the request ID, with the provider's as nativeResponseId.
                if (next.response && typeof next.response === "object") {
                    next.response = { ...next.response, id: ctx.requestId, nativeResponseId: cachedNativeId };
                }
            }

            if (!includeMeta && "meta" in next) {
                delete next.meta;
            }

            const isMessagesStream = ctx.endpoint === "messages" || ctx.protocol === "anthropic.messages";
            if (isMessagesStream) accumulateMessagesStreamUsage(next.message?.usage ?? next.usage);
            // message_start names the message as the buffered body does.
            if (isMessagesStream && next.message && typeof next.message === "object") {
                rememberNativeId(next);
                next.message = { ...next.message, id: ctx.requestId, nativeResponseId: cachedNativeId };
            }

            if (next.usage) {
                if (ctx.meta.debug) {
                    console.log("[gateway][pricing] stream frame usage", {
                        requestId: ctx.requestId,
                        endpoint: ctx.endpoint,
                        provider: result.provider,
                        usage: next.usage,
                    });
                }
                if (isMessagesStream) {
                    const costFields = next.type === "message_delta" ? messagesStreamCostFields(messagesStreamUsage) : undefined;
                    next.usage = normalizeAnthropicUsage(next.usage);
                    if (costFields) Object.assign(next.usage, costFields);
                } else if (card) {
                    const { pricedUsage, costKnown } = priceStreamFrameUsage(withInputModalityTokenMeters(shapeStreamUsageForClient(next.usage), next.usage));
                    if (ctx.meta.debug) {
                        console.log("[gateway][pricing] stream frame priced usage", {
                            requestId: ctx.requestId,
                            endpoint: ctx.endpoint,
                            provider: result.provider,
                            pricing: (pricedUsage as any)?.pricing ?? null,
                        });
                    }
                    next.usage = withStreamCostBasis(presentUsageForClient(withProviderHint(pricedUsage), {
                        endpoint: ctx.endpoint,
                    }), costKnown);
                } else {
                    next.usage = presentUsageForClient(
                        shapeStreamUsageForClient(next.usage),
                        { endpoint: ctx.endpoint }
                    );
                }
            } else if (next.response?.usage) {
                if (ctx.meta.debug) {
                    console.log("[gateway][pricing] stream response usage", {
                        requestId: ctx.requestId,
                        endpoint: ctx.endpoint,
                        provider: result.provider,
                        usage: next.response.usage,
                    });
                }
                if (ctx.endpoint === "messages" || ctx.protocol === "anthropic.messages") {
                    next.response.usage = normalizeAnthropicUsage(next.response.usage);
                } else if (card) {
                    const { pricedUsage, costKnown } = priceStreamFrameUsage(withInputModalityTokenMeters(shapeStreamUsageForClient(next.response.usage), next.response.usage));
                    if (ctx.meta.debug) {
                        console.log("[gateway][pricing] stream response priced usage", {
                            requestId: ctx.requestId,
                            endpoint: ctx.endpoint,
                            provider: result.provider,
                            pricing: (pricedUsage as any)?.pricing ?? null,
                        });
                    }
                    next.response.usage = withStreamCostBasis(presentUsageForClient(withProviderHint(pricedUsage), {
                        endpoint: ctx.endpoint,
                    }), costKnown);
                } else {
                    next.response.usage = presentUsageForClient(
                        shapeStreamUsageForClient(next.response.usage),
                        { endpoint: ctx.endpoint }
                    );
                }
            }

            const terminalPayload = getStreamTerminalPayload(next);
            if (terminalPayload && !appliedStreamResponsePlugins) {
                const pluginFinishReason =
                    normalizeFinishReason(extractFinishReason(terminalPayload), result.provider) ??
                    cachedFinishReason;
                const pluginOutcome = applyResponsePlugins({
                    ctx,
                    result,
                    payload: terminalPayload,
                    finishReason: pluginFinishReason,
                });
                ctx.pluginExecutions = pluginOutcome.executions;
                appliedStreamResponsePlugins = pluginOutcome.executions.length > 0;
                if (terminalPayload === next) {
                    Object.assign(next, pluginOutcome.payload);
                } else {
                    next.response = pluginOutcome.payload;
                }
                latestGatewaySnapshot = pluginOutcome.payload;
            }

            // Add API timing meta to terminal stream frames when requested.
            // Responses streams previously only received routing meta here, so chat
            // clients could not display API latency/generation/throughput values.
            const timingUsage =
                next.usage ??
                next.response?.usage ??
                next.message?.usage ??
                (next?.type === "message_stop" ? latestStreamUsageRaw : null) ??
                null;
            const matchedTimingFrame =
                next?.object === "chat.completion" ||
                next?.object === "response" ||
                next?.response?.object === "response" ||
                next?.response?.object === "chat.completion" ||
                next?.type === "message_delta" ||
                next?.type === "message_stop" ||
                (next?.object === "chat.completion.chunk" && timingUsage != null);
            if ((includeMeta || ctx.meta?.debug?.enabled) && matchedTimingFrame) {
                attachStreamTimingMeta({
                    ctx,
                    frame: next,
                    usage: timingUsage,
                });
            }
            if (
                (includeMeta || ctx.meta?.debug?.enabled) &&
                (next?.usage || next?.response?.usage || next?.object === "chat.completion" || next?.object === "response")
            ) {
                next.meta = {
                    ...next.meta,
                    routing: {
                        selected_provider: result.provider,
                        requested_params: ctx.requestedParams ?? [],
                        param_provider_count_before:
                            ctx.paramRoutingDiagnostics?.providerCountBefore ?? null,
                        param_provider_count_after:
                            ctx.paramRoutingDiagnostics?.providerCountAfter ?? null,
                        param_dropped_providers:
                            ctx.paramRoutingDiagnostics?.droppedProviders?.map((entry) => ({
                                provider: entry.providerId,
                                unsupported_params: entry.unsupportedParams,
                            })) ?? [],
                        dropped_params: droppedParamsForClient(ctx).map(({ param, reason }) => ({ param, reason })),
                    },
                    ...(ctx.pluginExecutions?.length
                        ? { plugin_executions: ctx.pluginExecutions }
                        : {}),
                };
            }
            if (
                shouldAttachRoutingDiagnostics(ctx) &&
                (next?.usage || next?.response?.usage || next?.object === "chat.completion" || next?.object === "response")
            ) {
                next.routing_diagnostics = (ctx as any).routingDiagnostics ?? null;
            }
            if (ctx.meta?.echoUpstreamRequest && result.mappedRequest) {
                if (next.usage || next.response?.usage || next.object === "chat.completion" || next.object === "response") {
                    next.upstream_request = result.mappedRequest;
                }
            }
            if (next.usage) {
                latestStreamUsageRaw = stripUsagePricing(next.usage);
            } else if (next.response?.usage) {
                latestStreamUsageRaw = stripUsagePricing(next.response.usage);
            }
            return next;
        },
        onStreamEvent,
        // Client gone and the drain still running: charge an estimate of what was generated so
        // far, in case the runtime stops the drain before the final usage (see
        // DRAIN_CHECKPOINT_DELAYS_MS). The final bill then settles the request's total, refunding
        // any excess. BYOK requests owe only the service fee and are skipped.
        onDrainCheckpoint: (progress) => {
            if (streamIsByok) return;
            const priced = priceDrainProgress(progress);
            if (!priced) return;
            dispatchBackground(recordProvisionalStreamCharge({ ctx, costNanos: priced.totalNanos, endpoint: ctx.endpoint }));
        },
        onFinalSnapshot: (snapshot: any) => {
            const payload = snapshot?.response ?? snapshot;
            latestGatewaySnapshot = payload;
			if (String(payload?.status ?? "").toLowerCase() === "failed") {
				streamFailed = true;
			}
            const finishReason = normalizeFinishReason(
                extractFinishReason(payload),
                result.provider
            );
            const outputToolCalls = countOutputToolCallsFromPayload(payload);
            if (outputToolCalls > 0) {
                cachedOutputToolCallCount = outputToolCalls;
            }
            const outputToolCallNames = collectOutputToolCallNamesFromPayload(payload);
            if (outputToolCallNames.length > 0) {
                cachedOutputToolCallNames = outputToolCallNames;
            }
            if (finishReason) {
                cachedFinishReason = finishReason;
                result.bill.finish_reason = finishReason;
            }
        },
        onFinalUsage: async (usageRaw: any, info) => {
            let releaseRuntime: () => void = () => { };
            try {
                releaseRuntime = ensureRuntimeForBackground();
            } catch (error) {
                console.error("[gateway] failed to initialize runtime for stream finalization", {
                    requestId: ctx.requestId,
                    endpoint: ctx.endpoint,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
            try {
            const effectiveUsageRaw = usageRaw ?? latestStreamUsageRaw ?? stripUsagePricing(result.bill.usage);
            const hasTextRequestFallbackEndpoint =
                ctx.endpoint === "chat.completions" ||
                ctx.endpoint === "responses" ||
                ctx.endpoint === "messages";
            const usageForShaping =
                effectiveUsageRaw ??
                (hasTextRequestFallbackEndpoint ? { requests: 1 } : null);
            if (info?.aborted && !cachedFinishReason) {
                cachedFinishReason = "cancel";
                result.bill.finish_reason = "cancel";
            }
            const isByok = (result?.keySource ?? ctx.meta.keySource) === "byok";
            const maybeWriteStickyForUsage = async (usageForSticky: any) => {
                if (!usageForSticky) return;
                try {
                    await maybeWriteStickyRoutingFromUsage({
                        workspaceId: ctx.workspaceId,
                        endpoint: ctx.endpoint,
                        model: stickyRoutingModel,
                        body: ctx.body,
                        providerId: result.provider,
                        apiModelId: result.apiModelId ?? null,
                        providerModelSlug: result.providerModelSlug ?? null,
                        keySource: result.keySource ?? null,
                        byokKeyId: result.byokKeyId ?? null,
                        usage: usageForSticky,
                        enabled: cacheAwareRoutingEnabled,
                        twelveHourCacheDropped: twelveHourCacheDroppedFor(ctx, result.provider),
                    });
                } catch (error) {
                    console.warn("[gateway] sticky routing write failed", {
                        endpoint: ctx.endpoint,
                        model: ctx.model,
                        provider: result.provider,
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            };
            if (ctx.meta.debug) {
                console.log("[gateway][pricing] stream final usage raw", {
                    requestId: ctx.requestId,
                    endpoint: ctx.endpoint,
                    provider: result.provider,
                    usage: effectiveUsageRaw,
                });
            }
            // console.log("[DEBUG After Stream] Final usage from stream:", usageRaw);
            const shapedUsage = attachToolUsageMetrics(
                withInputModalityTokenMeters(shapeStreamUsageForClient(usageForShaping), usageForShaping),
                buildToolUsage()
            );
            // Preserve metering even if pricing fails before a bill can be assigned.
            result.bill.usage = shapedUsage;
			const baseModel = getBaseModel(ctx.model);
			const healthContext = (result as any).healthContext ?? null;
            const healthProvider = healthContext?.provider ?? result.provider;
			const isProbe = Boolean(healthContext?.isProbe);
			// `aborted` only means no terminal event arrived. When the client had
			// already disconnected and the provider reported no error, the stream
			// ended because the caller left: a customer cancellation, neutral for
			// routing. With the client still connected, the provider dropped the
			// stream: a mid-stream failure that counts against the route.
			// A connection reset or body error from the upstream is a stream failure, not the
			// client leaving, even when the client had already disconnected.
			if (ctx.meta.upstreamStreamBroken === true) streamFailed = true;
			const { clientCancelled, midStreamError } = streamHealthSignals({
				aborted: info?.aborted === true,
				downstreamDisconnected: ctx.meta.downstreamDisconnected === true,
				streamFailed,
			});
			const healthImpact = classifyProviderHealthImpact({
				upstreamStatus: result.upstream.status,
				credentialSource: result.keySource,
				aborted: clientCancelled,
				// An upstream-completed empty response is a contract issue, not
				// evidence that the provider is unhealthy.
				midStreamError,
				finishReason: cachedFinishReason ?? result.bill.finish_reason ?? null,
			});
			if (info?.aborted || streamFailed || healthImpact === "failure") {
				const healthUpdate = await onCallEnd(ctx.endpoint, {
					observationId: healthContext?.observationId,
					startedAt: healthContext?.startedAt,
					probe: isProbe,
					provider: healthProvider,
					model: baseModel,
					ok: false,
					upstreamStatus: result.upstream.status,
					healthImpact,
					latency_ms: ctx.meta.latency_ms ?? null,
					generation_ms: ctx.meta.generation_ms ?? null,
				});
				if (isProbe && healthImpact !== "neutral" && !healthUpdate?.rateLimited) {
					await reportProbeResult(ctx.endpoint, healthProvider, baseModel, healthImpact === "success");
				} else if (healthImpact === "failure" && !healthUpdate?.rateLimited) {
					await maybeOpenOnRecentErrors(ctx.endpoint, healthProvider, baseModel);
				}
				const reason = info?.aborted ? "incomplete_stream" : "upstream_failure";
				await recordManagedProviderTokensOnce({
					ctx,
					providerId: result.provider,
					keySource: result.keySource,
					usage: shapedUsage,
					reservation: result.providerRateLimitReservation,
				});
				chargeRateLimitPolicyTokens(ctx, shapedUsage);
				suppressFailedResponseBilling({ ctx, result, usage: shapedUsage, reason });
				// Drain checkpoints charged an estimate: settle the request's total now. A failed
				// stream is not billed (0: everything is refunded). A stream the client left keeps
				// what it generated: priced from provider usage when the provider reported any,
				// otherwise no more than the checkpoints already estimated.
				// If this settlement cannot be recorded, the finalization error audit below records
				// the intended total for reconciliation; the checkpoint debit is not left silently.
				const stepMeta = ctx.meta as Record<string, unknown>;
				let billedNanos = 0;
				if (stepMeta.__chargedInSteps === true) {
					let finalNanos = 0;
					if (clientCancelled) {
						const priced = priceFinal(() => priceDrainProgress({ usage: effectiveUsageRaw, outputChars: streamedOutputChars }));
						const estimatedNanos = Number(stepMeta.__checkpointTotalNanos) || 0;
						finalNanos = priced?.inputReported ? priced.totalNanos : Math.min(priced?.totalNanos ?? estimatedNanos, estimatedNanos);
					}
					await recordUsageAndChargeOnce({ ctx, costNanos: finalNanos, endpoint: ctx.endpoint, throwOnFailure: true });
					billedNanos = finalNanos;
				}
				if (billedNanos > 0) {
					// The retained charge is the request's price: the row records it, and spend limits
					// and budgets count it like any other charge.
					const usage = (result.bill.usage && typeof result.bill.usage === "object" ? result.bill.usage : {}) as Record<string, any>;
					const { billing_suppression_reason: _dropped, ...pricing } = usage.pricing ?? {};
					result.bill.usage = {
						...usage,
						pricing: {
							...pricing,
							total_nanos: billedNanos,
							total_cents: billedNanos / 1e7,
							total_usd_str: (billedNanos / 1e9).toFixed(9),
							billing_suppressed: false,
							billing_basis: "drain_checkpoint",
						},
					};
					result.bill.cost_cents = billedNanos / 1e7;
				}
				if (clientCancelled) {
					await handleFailureAudit(
						ctx,
						result,
						CLIENT_CLOSED_REQUEST_STATUS,
						"client",
						"client_closed_request",
						"The client closed the stream before it completed.",
						result.rawResponse ?? latestGatewaySnapshot,
						undefined,
						undefined,
						stepMeta.__chargedInSteps === true || billedNanos > 0 ? { costNanos: billedNanos } : undefined,
					);
					return;
				}
				await handleFailureAudit(
					ctx,
					result,
					502,
					"upstream",
					"upstream_stream_failure",
					"The upstream stream failed before successful completion.",
					result.rawResponse ?? latestGatewaySnapshot,
					undefined,
					undefined,
					// Settled to 0: the checkpoint charge recorded for spend limits is lowered to it.
					stepMeta.__chargedInSteps === true ? { costNanos: 0 } : undefined,
				);
				return;
			}
			const ok =
                result.upstream.status >= 200 &&
                result.upstream.status < 400 &&
                !info?.aborted;
            if (ok) noteModelSubstitutionServed(ctx);
            await onCallEnd(ctx.endpoint, {
                observationId: healthContext?.observationId,
                startedAt: healthContext?.startedAt,
                probe: isProbe,
                provider: healthProvider,
                model: baseModel,
                ok,
                healthImpact,
				latency_ms: ctx.meta.latency_ms ?? null,
                generation_ms: ctx.meta.generation_ms ?? null,
                tokens_in: Number(
                    shapedUsage?.input_tokens ??
                        shapedUsage?.prompt_tokens ??
                        shapedUsage?.input_text_tokens ??
                        0
                ),
                tokens_out: Number(
                    shapedUsage?.output_tokens ??
                        shapedUsage?.completion_tokens ??
                        shapedUsage?.output_text_tokens ??
                        0
                ),
                ...promptTokensFromUsage(shapedUsage),
            });
            if (isProbe && healthImpact !== "neutral") {
				await reportProbeResult(ctx.endpoint, healthProvider, baseModel, healthImpact === "success");
            }

            const finalizeFromBill = async (bill: Bill | null | undefined) => {
                if (!bill) return false;
                const toolUsage = buildToolUsage();
                const usageFromBill = stripUsagePricing(bill.usage);
                let usageWithToolMetrics = attachToolUsageMetrics(
                    usageFromBill ?? shapedUsage ?? stripUsagePricing(result.bill.usage),
                    toolUsage
                );
                let totalCentsOverride = Number(
                    bill.usage?.pricing?.total_cents ?? bill.cost_cents ?? 0
                );
                let totalNanosOverride = Number(
                    bill.usage?.pricing?.total_nanos ?? Math.round(totalCentsOverride * 1e7)
                );
                let currencyHint = bill.currency ?? card?.currency ?? "USD";

                // Stream finalizers can return either raw or pre-priced usage.
                // Re-price from usage meters at the after-stage so billing stays
                // usage-first and provider-consistent.
                const usageHasMeters =
                    usageWithToolMetrics &&
                    typeof usageWithToolMetrics === "object" &&
                    Object.values(usageWithToolMetrics).some(
                        (value) => typeof value === "number" && Number.isFinite(value) && value >= 0
                    );
                if (card && usageHasMeters) {
                    const tier = ctx.teamEnrichment?.tier ?? 'basic';
                    const repriced = priceFinal(() => calculatePricing(
                        withInputModalityTokenMeters(shapeStreamUsageForClient(usageWithToolMetrics), usageWithToolMetrics),
                        card,
                        ctx.body,
                        tier,
                        ctx.meta
                    ));
                    usageWithToolMetrics = attachToolUsageMetrics(repriced.pricedUsage, toolUsage);
                    totalCentsOverride = repriced.totalCents;
                    totalNanosOverride = repriced.totalNanos;
                    currencyHint = repriced.currency ?? currencyHint;
                }
                alertUnexpectedZeroCostMedia({ ctx, result, card, totalNanos: totalNanosOverride });

                const pricedWithByokSubtotal = await applyByokServiceFeeWithToolCharges({
                    toolCharges: ctx.meta.serverToolPricing,
                    workspaceId: ctx.workspaceId,
                    idempotencyKey: ctx.billingRequestId,
                    isByok,
                    baseCostNanos: totalNanosOverride,
                    pricedUsage: usageWithToolMetrics,
                    currencyHint,
                });
				const successfulBilling = applySuccessfulResponseBillingPolicy({
					endpoint: ctx.endpoint,
					pricedUsage: pricedWithByokSubtotal.pricedUsage,
					totalNanos: pricedWithByokSubtotal.totalNanos,
					totalCents: pricedWithByokSubtotal.totalCents,
				});
                const pricedWithByok = {
					...pricedWithByokSubtotal,
					...successfulBilling,
					...applyDataContributionDiscount({
						pricedUsage: successfulBilling.pricedUsage,
						totalNanos: successfulBilling.totalNanos,
						enabled: ctx.teamSettings?.dataContributionEnabled === true,
						isByok,
						discountBps: ctx.teamSettings?.dataContributionDiscountBps,
					}),
				};
                result.bill.cost_cents = pricedWithByok.totalCents;
                result.bill.currency = pricedWithByok.currency;
                result.bill.usage = pricedWithByok.pricedUsage;
                result.bill.finish_reason = bill.finish_reason ?? cachedFinishReason ?? result.bill.finish_reason;
                await maybeWriteStickyForUsage(result.bill.usage);

                // Normalize finish reason for consistent storage
                const normalizedFinishReason = normalizeFinishReason(
                    bill.finish_reason ?? cachedFinishReason ?? null,
                    result.provider
                );
                if (normalizedFinishReason) {
                    cachedFinishReason = normalizedFinishReason;
                    result.bill.finish_reason = normalizedFinishReason;
                }

				await recordManagedProviderTokensOnce({ ctx, providerId: result.provider, keySource: result.keySource, usage: result.bill.usage, reservation: result.providerRateLimitReservation });
				chargeRateLimitPolicyTokens(ctx, result.bill.usage);
                await recordUsageAndChargeOnce({
                    ctx,
                    costNanos: pricedWithByok.totalNanos,
                    endpoint: ctx.endpoint,
                    throwOnFailure: true,
                });

                await handleSuccessAudit(
                    ctx,
                    result,
                    true,
                    result.bill.usage ?? null,
                    pricedWithByok.totalCents,
                    pricedWithByok.totalNanos,
                    pricedWithByok.currency,
                    normalizedFinishReason,
                    upstreamStatus,
                    result.bill.upstream_id ?? null,
                    auditGatewayResponse(),
                );

                return true;
            };

            // Executors that read usage from the upstream stream itself (Claude on Anthropic,
            // Bedrock Messages, Vertex) are authoritative: transformed client frames can omit
            // meters such as cache writes, so bill from the finalizer whenever it has usage.
            let finalizedBill: Bill | null | undefined;
            const readFinalizedBill = async () => {
                if (finalizedBill === undefined) {
                    finalizedBill = result.usageFinalizer ? await result.usageFinalizer() : null;
                }
                return finalizedBill;
            };
            if (result.usageFinalizerAuthoritative && result.usageFinalizer) {
                const authoritative = await readFinalizedBill();
                if (hasBillableTokenUsage(authoritative?.usage) && await finalizeFromBill(authoritative)) return;
            }

            if (!effectiveUsageRaw) {
                const usageWithToolMetrics = attachToolUsageMetrics(null, {
                    ...buildToolUsage(),
                });
                const finalized = await readFinalizedBill();
                if (await finalizeFromBill(finalized)) return;
                const fallbackUsageWithToolMetrics = attachToolUsageMetrics(
                    shapeStreamUsageForClient(usageForShaping),
                    buildToolUsage()
                );
                const pricedWithByokSubtotal = await applyByokServiceFeeWithToolCharges({
                    toolCharges: ctx.meta.serverToolPricing,
                    workspaceId: ctx.workspaceId,
                    idempotencyKey: ctx.billingRequestId,
                    isByok,
                    baseCostNanos: 0,
                    pricedUsage: fallbackUsageWithToolMetrics ?? usageWithToolMetrics,
                    currencyHint: result.bill.currency ?? card?.currency ?? "USD",
                });
				const successfulBilling = applySuccessfulResponseBillingPolicy({
					endpoint: ctx.endpoint,
					pricedUsage: pricedWithByokSubtotal.pricedUsage,
					totalNanos: pricedWithByokSubtotal.totalNanos,
					totalCents: pricedWithByokSubtotal.totalCents,
				});
                const pricedWithByok = {
					...pricedWithByokSubtotal,
					...successfulBilling,
					...applyDataContributionDiscount({
						pricedUsage: successfulBilling.pricedUsage,
						totalNanos: successfulBilling.totalNanos,
						enabled: ctx.teamSettings?.dataContributionEnabled === true,
						isByok,
						discountBps: ctx.teamSettings?.dataContributionDiscountBps,
					}),
				};
                await maybeWriteStickyForUsage(pricedWithByok.pricedUsage);
				await recordManagedProviderTokensOnce({ ctx, providerId: result.provider, keySource: result.keySource, usage: pricedWithByok.pricedUsage, reservation: result.providerRateLimitReservation });
				chargeRateLimitPolicyTokens(ctx, pricedWithByok.pricedUsage);
                await recordUsageAndChargeOnce({
                    ctx,
                    costNanos: pricedWithByok.totalNanos,
                    endpoint: ctx.endpoint,
                    throwOnFailure: true,
                });
                await handleSuccessAudit(
                    ctx,
                    result,
                    true,
                    pricedWithByok.pricedUsage,
                    pricedWithByok.totalCents,
                    pricedWithByok.totalNanos,
                    pricedWithByok.currency,
                    cachedFinishReason,
                    upstreamStatus,
                    result.bill.upstream_id ?? null,
                    auditGatewayResponse(),
                );
                return;
            }

            const tier = ctx.teamEnrichment?.tier ?? 'basic';
            const { pricedUsage, totalCents, totalNanos, currency } = priceFinal(() => calculatePricing(
                shapedUsage,
                card,
                ctx.body,
                tier,
                ctx.meta
            ));
            alertUnexpectedZeroCostMedia({ ctx, result, card, totalNanos });
            if (ctx.meta.debug) {
                console.log("[gateway][pricing] stream final priced usage", {
                    requestId: ctx.requestId,
                    endpoint: ctx.endpoint,
                    provider: result.provider,
                    pricing: (pricedUsage as any)?.pricing ?? null,
                    totalCents,
                    totalNanos,
                    currency,
                });
            }

            const usageWithToolMetrics = attachToolUsageMetrics(pricedUsage, {
                ...buildToolUsage(),
            });
            const pricedWithByokSubtotal = await applyByokServiceFeeWithToolCharges({
                toolCharges: ctx.meta.serverToolPricing,
                workspaceId: ctx.workspaceId,
                idempotencyKey: ctx.billingRequestId,
                isByok,
                baseCostNanos: totalNanos,
                pricedUsage: usageWithToolMetrics,
                currencyHint: currency,
            });
			const successfulBilling = applySuccessfulResponseBillingPolicy({
				endpoint: ctx.endpoint,
				pricedUsage: pricedWithByokSubtotal.pricedUsage,
				totalNanos: pricedWithByokSubtotal.totalNanos,
				totalCents: pricedWithByokSubtotal.totalCents,
			});
            const pricedWithByok = {
				...pricedWithByokSubtotal,
				...successfulBilling,
				...applyDataContributionDiscount({
					pricedUsage: successfulBilling.pricedUsage,
					totalNanos: successfulBilling.totalNanos,
					enabled: ctx.teamSettings?.dataContributionEnabled === true,
					isByok,
					discountBps: ctx.teamSettings?.dataContributionDiscountBps,
				}),
			};

            result.bill.cost_cents = pricedWithByok.totalCents;
            result.bill.currency = pricedWithByok.currency;
            result.bill.usage = pricedWithByok.pricedUsage;
            result.bill.finish_reason = cachedFinishReason ?? result.bill.finish_reason;
            await maybeWriteStickyForUsage(result.bill.usage);

			await recordManagedProviderTokensOnce({ ctx, providerId: result.provider, keySource: result.keySource, usage: result.bill.usage, reservation: result.providerRateLimitReservation });
			chargeRateLimitPolicyTokens(ctx, result.bill.usage);
            await recordUsageAndChargeOnce({
                ctx,
                costNanos: pricedWithByok.totalNanos,
                endpoint: ctx.endpoint,
                throwOnFailure: true,
            });

            await handleSuccessAudit(
                ctx,
                result,
                true,
                result.bill.usage,
                pricedWithByok.totalCents,
                pricedWithByok.totalNanos,
                pricedWithByok.currency,
                cachedFinishReason,
                upstreamStatus,
                result.bill.upstream_id ?? null,
                auditGatewayResponse(),
            );

            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.error("[gateway] stream finalization failed", {
                    requestId: ctx.requestId,
                    workspaceId: ctx.workspaceId,
                    error: message,
                });
                // A stream charged at drain checkpoints whose final settlement could not be recorded
                // still holds a charge (the checkpoints, or a final that committed unacknowledged):
                // the row records it and spend limits count it, never 0 unless the database says so.
                // recordUsageAndChargeOnce read back the stored charge (ctx.confirmedChargeNanos) and
                // kept the intended bill (ctx.uncollectedChargeNanos); handleFailureAudit writes both.
                // Policy when the final bill could not be priced: the charged total is the final (no
                // refund, nothing more), recorded as both, pending reconciliation.
                const stepMeta = ctx.meta as Record<string, unknown>;
                const finalPricingFailed = stepMeta.__chargedInSteps === true && stepMeta.__finalPricingFailed === true;
                if (finalPricingFailed) {
                    try {
                        await keepChargedTotalAsFinal(ctx, ctx.endpoint);
                    } catch (settleError) {
                        console.error("[gateway] stepped charge not settled after a pricing failure", {
                            requestId: ctx.requestId,
                            error: settleError instanceof Error ? settleError.message : String(settleError),
                        });
                    }
                }
                const unsettledCharge = typeof ctx.confirmedChargeNanos === "number"
                    ? { costNanos: ctx.confirmedChargeNanos, stored: ctx.confirmedChargeSource === "database" }
                    : null;
                await handleFailureAudit(
                    ctx,
                    result,
                    500,
                    "gateway",
                    "stream_finalization_failed",
                    "The response was delivered but accounting finalization failed.",
                    {
                        upstream_status: upstreamStatus,
                        response_delivered: true,
                        billing_status: !finalPricingFailed && stepMeta.__usageChargeRecorded === true ? "recorded" : "pending_reconciliation",
                        ...(finalPricingFailed ? { reconciliation_reason: "final_pricing_failed" } : {}),
                        // A stream charged at drain checkpoints: the total its final settlement meant to record.
                        ...(typeof (ctx.meta as Record<string, unknown>).__steppedFinalTotalNanos === "number"
                            ? { charged_in_steps: true, intended_final_total_nanos: (ctx.meta as Record<string, unknown>).__steppedFinalTotalNanos }
                            : {}),
                        ...(unsettledCharge
                            ? { charged_total_nanos: unsettledCharge.costNanos, charged_total_source: unsettledCharge.stored ? "database" : "last_checkpoint" }
                            : {}),
                        cause: message,
                    },
                    null,
                    {
                        gatewayResponse: auditGatewayResponse(),
                        rawUsage: usageRaw ?? latestStreamUsageRaw ?? result.bill.usage,
                        pricingCard: card,
                    },
                );
            } finally {
                releaseRuntime();
            }
        },
        timingHeader,
    });

    return resp;
}

export function handlePassthroughFallback(upstream: Response): Response {
    return passthrough(upstream);
}

