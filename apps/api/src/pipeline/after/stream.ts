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
import { shapeUsageForClient } from "../usage";
import { normalizeAnthropicUsage, presentUsageForClient, extractFinishReason } from "./payload";
import { onCallEnd, reportProbeResult, maybeOpenOnRecentErrors } from "../execute/health";
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
    // Cache native ID from first chunk to avoid checking every frame
    let cachedNativeId: string | undefined;
    let cachedFinishReason: string | null = null;
    let latestGatewaySnapshot: any = null;
    const streamedToolCallKeys = new Set<string>();
    const requestedToolCount = countRequestedTools(ctx.body);
    const requestedToolResultCount = countRequestedToolResults(ctx.body);
    let cachedOutputToolCallCount: number | null = null;
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
                    const shapedUsage = shapeUsageForClient(next.usage, {
                        endpoint: ctx.endpoint,
                        body: ctx.body,
                    });
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
                    next.usage = presentUsageForClient(pricedUsage, { endpoint: ctx.endpoint });
                } else {
                    next.usage = presentUsageForClient(
                        shapeUsageForClient(next.usage, {
                            endpoint: ctx.endpoint,
                            body: ctx.body,
                        }),
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
                    const shapedUsage = shapeUsageForClient(next.response.usage, {
                        endpoint: ctx.endpoint,
                        body: ctx.body,
                    });
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
                    next.response.usage = presentUsageForClient(pricedUsage, { endpoint: ctx.endpoint });
                } else {
                    next.response.usage = presentUsageForClient(
                        shapeUsageForClient(next.response.usage, {
                            endpoint: ctx.endpoint,
                            body: ctx.body,
                        }),
                        { endpoint: ctx.endpoint }
                    );
                }
            }

            // Add meta to final frame when available and requested
            if (includeMeta && next?.object === "chat.completion" && next?.usage && ctx.meta.generation_ms !== undefined) {
                const generationMs = ctx.meta.generation_ms;
                const tokensOut = next.usage.completion_tokens ?? next.usage.output_tokens ?? next.usage.output_text_tokens ?? 0;
                const throughputTps = generationMs > 0 ? tokensOut / (generationMs / 1000) : 0;

                next.meta = {
                    ...next.meta,
                    throughput_tps: throughputTps,
                    generation_ms: generationMs,
                    latency_ms: ctx.meta.latency_ms ?? 0
                };
                if (next.meta && typeof next.meta === "object" && "finish_reason" in next.meta) {
                    delete (next.meta as Record<string, unknown>).finish_reason;
                }
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
                };
            }
            if (ctx.meta?.echoUpstreamRequest && result.mappedRequest) {
                if (next.usage || next.response?.usage || next.object === "chat.completion" || next.object === "response") {
                    next.upstream_request = result.mappedRequest;
                }
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
            const releaseRuntime = ensureRuntimeForBackground();
            try {
            const isByok = (result?.keySource ?? ctx.meta.keySource) === "byok";
            if (ctx.meta.debug) {
                console.log("[gateway][pricing] stream final usage raw", {
                    requestId: ctx.requestId,
                    endpoint: ctx.endpoint,
                    provider: result.provider,
                    usage: usageRaw,
                });
            }
            // console.log("[DEBUG After Stream] Final usage from stream:", usageRaw);
            const shapedUsage = attachToolUsageMetrics(
                shapeUsageForClient(usageRaw, { endpoint: ctx.endpoint, body: ctx.body }),
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
            await onCallEnd(ctx.endpoint, {
                provider: result.provider,
                model: baseModel,
                ok,
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
            if (isProbe) {
                await reportProbeResult(ctx.endpoint, result.provider, baseModel, ok);
            } else {
                await maybeOpenOnRecentErrors(ctx.endpoint, result.provider, baseModel);
            }

            const finalizeFromBill = async (bill: Bill | null | undefined) => {
                if (!bill) return false;
                const usageWithToolMetrics = attachToolUsageMetrics(
                    bill.usage ?? shapedUsage ?? result.bill.usage,
                    {
                        request_tool_count: requestedToolCount > 0 ? requestedToolCount : null,
                        request_tool_result_count: requestedToolResultCount > 0 ? requestedToolResultCount : null,
                        output_tool_call_count: cachedOutputToolCallCount,
                    }
                );
                const totalNanosOverride =
                    bill.usage?.pricing?.total_nanos ??
                    Math.round(bill.cost_cents * 1e7);
                const pricedWithByok = await applyByokServiceFee({
                    teamId: ctx.teamId,
                    isByok,
                    baseCostNanos: totalNanosOverride,
                    pricedUsage: usageWithToolMetrics,
                    currencyHint: bill.currency ?? card?.currency ?? "USD",
                });
                result.bill.cost_cents = pricedWithByok.totalCents;
                result.bill.currency = pricedWithByok.currency;
                result.bill.usage = pricedWithByok.pricedUsage;
                result.bill.finish_reason = bill.finish_reason ?? result.bill.finish_reason;

                // Normalize finish reason for consistent storage
                const normalizedFinishReason = normalizeFinishReason(
                    bill.finish_reason ?? null,
                    result.provider
                );

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

            if (!usageRaw) {
                const usageWithToolMetrics = attachToolUsageMetrics(null, {
                    request_tool_count: requestedToolCount > 0 ? requestedToolCount : null,
                    request_tool_result_count: requestedToolResultCount > 0 ? requestedToolResultCount : null,
                    output_tool_call_count: cachedOutputToolCallCount,
                });
                const finalized = result.usageFinalizer ? await result.usageFinalizer() : null;
                if (await finalizeFromBill(finalized)) return;
                const pricedWithByok = await applyByokServiceFee({
                    teamId: ctx.teamId,
                    isByok,
                    baseCostNanos: 0,
                    pricedUsage: usageWithToolMetrics,
                    currencyHint: result.bill.currency ?? card?.currency ?? "USD",
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
                teamId: ctx.teamId,
                isByok,
                baseCostNanos: totalNanos,
                pricedUsage: usageWithToolMetrics,
                currencyHint: currency,
            });

            result.bill.cost_cents = pricedWithByok.totalCents;
            result.bill.currency = pricedWithByok.currency;
            result.bill.usage = pricedWithByok.pricedUsage;
            result.bill.finish_reason = cachedFinishReason ?? result.bill.finish_reason;

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










