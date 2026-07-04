// lib/gateway/after/stream.ts
// Purpose: After-stage logic for payload shaping, pricing, auditing, and streaming.
// Why: Keeps post-execution side-effects consistent.
// How: Wraps streaming responses and finalizes usage.

import { passthroughWithPricing, passthrough } from "./streaming";
import type { UnifiedStreamEvent } from "./stream-events";
import type { PipelineContext } from "../before/types";
import type { RequestResult, Bill } from "../execute";
import type { PriceCard } from "../pricing";
import { calculatePricing } from "./pricing";
import { handleSuccessAudit } from "./audit";
import { recordUsageAndChargeOnce } from "./charge";
import { shapeUsageForClient, stripUsagePricing } from "../usage";
import { normalizeAnthropicUsage, presentUsageForClient, extractFinishReason } from "./payload";
import {
	classifyProviderHealthImpact,
	onCallEnd,
	reportProbeResult,
	maybeOpenOnRecentErrors,
} from "../execute/health";
import { getBaseModel } from "../execute/utils";
import { logDebugEvent, previewValue } from "../debug";
import { ensureRuntimeForBackground } from "@/runtime/env";
import { normalizeFinishReason } from "../audit/normalize-finish-reason";
import { applyByokServiceFee } from "../pricing/byok-fee";
import {
    attachToolUsageMetrics,
    countOutputToolCallsFromPayload,
    countRequestedTools,
    countRequestedToolResults,
} from "./tool-usage";
import {
    maybeWriteStickyRoutingFromUsage,
    resolveCacheAwareRoutingPreference,
} from "../execute/sticky-routing";
import { applyResponsePlugins } from "@/plugins/registry";

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
    const throughputTps =
        typeof ctx.meta.throughput_tps === "number"
            ? ctx.meta.throughput_tps
            : generationMs > 0 && tokensOut > 0
                ? tokensOut / (generationMs / 1000)
                : null;

    frame.meta = {
        ...frame.meta,
        throughput_tps: throughputTps,
        generation_ms: generationMs,
        latency_ms: ctx.meta.latency_ms ?? 0,
    };
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
    // Cache native ID from first chunk to avoid checking every frame
    let cachedNativeId: string | undefined;
    let cachedFinishReason: string | null = null;
    let latestStreamUsageRaw: any = null;
    let latestGatewaySnapshot: any = null;
    let appliedStreamResponsePlugins = false;
    const streamedToolCallKeys = new Set<string>();
    const requestedToolCount = countRequestedTools(ctx.body);
    const requestedToolResultCount = countRequestedToolResults(ctx.body);
    let cachedOutputToolCallCount: number | null = null;
    const withProviderHint = (usage: any) => {
        if (!usage || typeof usage !== "object") return usage;
        return {
            ...usage,
            _provider_id: result.provider,
        };
    };
    const shapeStreamUsageForClient = (usage: any) =>
        shapeUsageForClient(withProviderHint(usage), {
            endpoint: ctx.endpoint,
            body: ctx.body,
        });
    if (ctx.meta?.debug) {
        void logDebugEvent("stream.start", {
            requestId: ctx.requestId,
            endpoint: ctx.endpoint,
            provider: result.provider,
            upstreamStatus,
            mappedRequest: previewValue(result.mappedRequest),
        });
    }

    const onStreamEvent = (event: UnifiedStreamEvent) => {
        if (event.type === "delta_tool") {
            const key =
                event.toolCallId ??
                `choice:${event.choiceIndex ?? 0}:tool:${event.toolIndex ?? streamedToolCallKeys.size}`;
            streamedToolCallKeys.add(key);
            cachedOutputToolCallCount = streamedToolCallKeys.size;
            return;
        }

        if (event.type === "stop" && event.finishReason) {
            cachedFinishReason = normalizeFinishReason(event.finishReason, result.provider);
            result.bill.finish_reason = cachedFinishReason;
        }
    };

    const resp = await passthroughWithPricing({
        upstream,
        ctx,
        provider: result.provider,
        priceCard: card,
        rewriteFrame: (frame: any) => {
            if (!frame || typeof frame !== "object") return frame;
            const includeMeta = ctx.meta.returnMeta ?? false;
            const next: any = { ...frame };
            delete next.provider;
            delete next.gateway;

            if (ctx.endpoint === "chat.completions" || ctx.endpoint === "responses") {
                // Cache native ID from first chunk that has one
                if (!cachedNativeId) {
                    cachedNativeId = typeof next.nativeResponseId === "string"
                        ? next.nativeResponseId
                        : (typeof next.id === "string" ? next.id : undefined);
                }
                // Use cached native ID for all subsequent frames
                if (!next.nativeResponseId && cachedNativeId) {
                    next.nativeResponseId = cachedNativeId;
                }
                next.id = ctx.requestId;
            }

            if (!includeMeta && "meta" in next) {
                delete next.meta;
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
                if (ctx.endpoint === "messages" || ctx.protocol === "anthropic.messages") {
                    next.usage = normalizeAnthropicUsage(next.usage);
                } else if (card) {
                    const shapedUsage = shapeStreamUsageForClient(next.usage);
                    const tier = ctx.teamEnrichment?.tier ?? 'basic';
                    const { pricedUsage } = calculatePricing(
                        shapedUsage,
                        card,
                        ctx.body,
                        tier
                    );
                    if (ctx.meta.debug) {
                        console.log("[gateway][pricing] stream frame priced usage", {
                            requestId: ctx.requestId,
                            endpoint: ctx.endpoint,
                            provider: result.provider,
                            pricing: (pricedUsage as any)?.pricing ?? null,
                        });
                    }
                    next.usage = presentUsageForClient(withProviderHint(pricedUsage), {
                        endpoint: ctx.endpoint,
                    });
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
                    const shapedUsage = shapeStreamUsageForClient(next.response.usage);
                    const tier = ctx.teamEnrichment?.tier ?? 'basic';
                    const { pricedUsage } = calculatePricing(
                        shapedUsage,
                        card,
                        ctx.body,
                        tier
                    );
                    if (ctx.meta.debug) {
                        console.log("[gateway][pricing] stream response priced usage", {
                            requestId: ctx.requestId,
                            endpoint: ctx.endpoint,
                            provider: result.provider,
                            pricing: (pricedUsage as any)?.pricing ?? null,
                        });
                    }
                    next.response.usage = presentUsageForClient(withProviderHint(pricedUsage), {
                        endpoint: ctx.endpoint,
                    });
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
            const matchedTimingFrame =
                next?.object === "chat.completion" ||
                next?.object === "response" ||
                next?.response?.object === "response" ||
                next?.response?.object === "chat.completion" ||
                next?.type === "message_delta" ||
                next?.type === "message_stop";
            const timingUsage =
                next.usage ??
                next.response?.usage ??
                next.message?.usage ??
                null;
            if (includeMeta && matchedTimingFrame) {
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
        onFinalSnapshot: (snapshot: any) => {
            const payload = snapshot?.response ?? snapshot;
            latestGatewaySnapshot = payload;
            const finishReason = normalizeFinishReason(
                extractFinishReason(payload),
                result.provider
            );
            const outputToolCalls = countOutputToolCallsFromPayload(payload);
            if (outputToolCalls > 0) {
                cachedOutputToolCallCount = outputToolCalls;
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
                        usage: usageForSticky,
                        enabled: cacheAwareRoutingEnabled,
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
                shapeStreamUsageForClient(usageForShaping),
                {
                    request_tool_count: requestedToolCount > 0 ? requestedToolCount : null,
                    output_tool_call_count: cachedOutputToolCallCount,
                }
            );
            const baseModel = getBaseModel(ctx.model);
            const healthContext = (result as any).healthContext ?? null;
            const isProbe = Boolean(healthContext?.isProbe);
            const ok =
                result.upstream.status >= 200 &&
                result.upstream.status < 400 &&
                !info?.aborted;
            const healthImpact = classifyProviderHealthImpact({
                upstreamStatus: result.upstream.status,
                aborted: info?.aborted === true,
            });
            await onCallEnd(ctx.endpoint, {
                provider: result.provider,
                model: baseModel,
                ok,
                healthImpact,
                latency_ms: ctx.meta.latency_ms ?? 0,
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
            });
            if (isProbe && healthImpact !== "neutral") {
                await reportProbeResult(ctx.endpoint, result.provider, baseModel, ok);
            } else if (healthImpact === "failure") {
                await maybeOpenOnRecentErrors(ctx.endpoint, result.provider, baseModel);
            }

            const finalizeFromBill = async (bill: Bill | null | undefined) => {
                if (!bill) return false;
                const toolUsage = {
                    request_tool_count: requestedToolCount > 0 ? requestedToolCount : null,
                    request_tool_result_count: requestedToolResultCount > 0 ? requestedToolResultCount : null,
                    output_tool_call_count: cachedOutputToolCallCount,
                };
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
                    const repriced = calculatePricing(
                        shapeStreamUsageForClient(usageWithToolMetrics),
                        card,
                        ctx.body,
                        tier
                    );
                    usageWithToolMetrics = attachToolUsageMetrics(repriced.pricedUsage, toolUsage);
                    totalCentsOverride = repriced.totalCents;
                    totalNanosOverride = repriced.totalNanos;
                    currencyHint = repriced.currency ?? currencyHint;
                }

                const pricedWithByok = await applyByokServiceFee({
                    workspaceId: ctx.workspaceId,
                    isByok,
                    baseCostNanos: totalNanosOverride,
                    pricedUsage: usageWithToolMetrics,
                    currencyHint,
                });
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
                    latestGatewaySnapshot,
                );

                await recordUsageAndChargeOnce({
                    ctx,
                    costNanos: pricedWithByok.totalNanos,
                    endpoint: ctx.endpoint,
                });
                return true;
            };

            if (!effectiveUsageRaw) {
                const usageWithToolMetrics = attachToolUsageMetrics(null, {
                    request_tool_count: requestedToolCount > 0 ? requestedToolCount : null,
                    request_tool_result_count: requestedToolResultCount > 0 ? requestedToolResultCount : null,
                    output_tool_call_count: cachedOutputToolCallCount,
                });
                const finalized = result.usageFinalizer ? await result.usageFinalizer() : null;
                if (await finalizeFromBill(finalized)) return;
                const fallbackUsageWithToolMetrics = attachToolUsageMetrics(
                    shapeStreamUsageForClient(usageForShaping),
                    {
                        request_tool_count: requestedToolCount > 0 ? requestedToolCount : null,
                        request_tool_result_count: requestedToolResultCount > 0 ? requestedToolResultCount : null,
                        output_tool_call_count: cachedOutputToolCallCount,
                    }
                );
                const pricedWithByok = await applyByokServiceFee({
                    workspaceId: ctx.workspaceId,
                    isByok,
                    baseCostNanos: 0,
                    pricedUsage: fallbackUsageWithToolMetrics ?? usageWithToolMetrics,
                    currencyHint: result.bill.currency ?? card?.currency ?? "USD",
                });
                await maybeWriteStickyForUsage(pricedWithByok.pricedUsage);
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
                    latestGatewaySnapshot,
                );
                await recordUsageAndChargeOnce({
                    ctx,
                    costNanos: pricedWithByok.totalNanos,
                    endpoint: ctx.endpoint,
                });
                return;
            }

            const tier = ctx.teamEnrichment?.tier ?? 'basic';
            const { pricedUsage, totalCents, totalNanos, currency } = calculatePricing(
                shapedUsage,
                card,
                ctx.body,
                tier
            );
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
                request_tool_count: requestedToolCount > 0 ? requestedToolCount : null,
                request_tool_result_count: requestedToolResultCount > 0 ? requestedToolResultCount : null,
                output_tool_call_count: cachedOutputToolCallCount,
            });
            const pricedWithByok = await applyByokServiceFee({
                workspaceId: ctx.workspaceId,
                isByok,
                baseCostNanos: totalNanos,
                pricedUsage: usageWithToolMetrics,
                currencyHint: currency,
            });

            result.bill.cost_cents = pricedWithByok.totalCents;
            result.bill.currency = pricedWithByok.currency;
            result.bill.usage = pricedWithByok.pricedUsage;
            result.bill.finish_reason = cachedFinishReason ?? result.bill.finish_reason;
            await maybeWriteStickyForUsage(result.bill.usage);

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
                latestGatewaySnapshot,
            );

            await recordUsageAndChargeOnce({
                ctx,
                costNanos: pricedWithByok.totalNanos,
                endpoint: ctx.endpoint,
            });
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












