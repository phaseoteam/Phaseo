// lib/gateway/after/stream.ts
import { passthroughWithPricing, passthrough } from "./streaming";
import type { PipelineContext } from "../before/types";
import type { RequestResult, Bill } from "../execute";
import type { PriceCard } from "../pricing";
import { calculatePricing } from "./pricing";
import { handleSuccessAudit } from "./audit";
import { recordUsageAndCharge } from "../pricing/persist";
import { shapeUsageForClient } from "../usage";
import { presentUsageForClient } from "./payload";
import { emitGatewayRequestEvent } from "@observability/events";

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

    const resp = await passthroughWithPricing({
        upstream,
        ctx,
        provider: result.provider,
        priceCard: card,
        rewriteFrame: (frame: any) => {
            if (!frame || typeof frame !== "object") return frame;
            const includeMeta = ctx.meta.returnMeta ?? false;
            const includeUsage = ctx.meta.returnUsage ?? false;
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

            if (!includeUsage) {
                if ("usage" in next) delete next.usage;
                if (next.response && typeof next.response === "object" && "usage" in next.response) {
                    delete next.response.usage;
                }
            } else if (next.usage) {
                if (ctx.meta.debug) {
                    console.log("[gateway][pricing] stream frame usage", {
                        requestId: ctx.requestId,
                        endpoint: ctx.endpoint,
                        provider: result.provider,
                        usage: next.usage,
                    });
                }
                if (card) {
                    const shapedUsage = shapeUsageForClient(next.usage, {
                        endpoint: ctx.endpoint,
                        body: ctx.body,
                    });
                    const { pricedUsage } = calculatePricing(
                        shapedUsage,
                        card,
                        ctx.body
                    );
                    if (ctx.meta.debug) {
                        console.log("[gateway][pricing] stream frame priced usage", {
                            requestId: ctx.requestId,
                            endpoint: ctx.endpoint,
                            provider: result.provider,
                            pricing: (pricedUsage as any)?.pricing ?? null,
                        });
                    }
                    next.usage = presentUsageForClient(pricedUsage);
                } else {
                    next.usage = presentUsageForClient(
                        shapeUsageForClient(next.usage, {
                            endpoint: ctx.endpoint,
                            body: ctx.body,
                        })
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
                if (card) {
                    const shapedUsage = shapeUsageForClient(next.response.usage, {
                        endpoint: ctx.endpoint,
                        body: ctx.body,
                    });
                    const { pricedUsage } = calculatePricing(
                        shapedUsage,
                        card,
                        ctx.body
                    );
                    if (ctx.meta.debug) {
                        console.log("[gateway][pricing] stream response priced usage", {
                            requestId: ctx.requestId,
                            endpoint: ctx.endpoint,
                            provider: result.provider,
                            pricing: (pricedUsage as any)?.pricing ?? null,
                        });
                    }
                    next.response.usage = presentUsageForClient(pricedUsage);
                } else {
                    next.response.usage = presentUsageForClient(
                        shapeUsageForClient(next.response.usage, {
                            endpoint: ctx.endpoint,
                            body: ctx.body,
                        })
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
            if (ctx.meta?.echoUpstreamRequest && result.mappedRequest) {
                if (next.usage || next.response?.usage || next.object === "chat.completion" || next.object === "response") {
                    next.upstream_request = result.mappedRequest;
                }
            }
            return next;
        },
        onFinalUsage: async (usageRaw: any) => {
            if (ctx.meta.debug) {
                console.log("[gateway][pricing] stream final usage raw", {
                    requestId: ctx.requestId,
                    endpoint: ctx.endpoint,
                    provider: result.provider,
                    usage: usageRaw,
                });
            }
            // console.log("[DEBUG After Stream] Final usage from stream:", usageRaw);
            const shapedUsage = shapeUsageForClient(usageRaw, { endpoint: ctx.endpoint, body: ctx.body });

            const finalizeFromBill = async (bill: Bill | null | undefined) => {
                if (!bill) return false;
                result.bill.cost_cents = bill.cost_cents;
                result.bill.currency = bill.currency;
                result.bill.usage = bill.usage ?? shapedUsage ?? result.bill.usage;
                result.bill.finish_reason = bill.finish_reason ?? result.bill.finish_reason;

                const totalNanosOverride =
                    bill.usage?.pricing?.total_nanos ??
                    Math.round(bill.cost_cents * 1e7);

                await handleSuccessAudit(
                    ctx,
                    result,
                    true,
                    result.bill.usage ?? null,
                    bill.cost_cents,
                    totalNanosOverride,
                    bill.currency,
                    bill.finish_reason ?? null,
                    upstreamStatus,
                    result.bill.upstream_id ?? null
                );
                await emitGatewayRequestEvent({
                    ctx,
                    result,
                    statusCode: upstreamStatus,
                    success: true,
                    finishReason: bill.finish_reason ?? null,
                    usage: result.bill.usage ?? null,
                    pricing: {
                        total_cents: bill.cost_cents,
                        total_nanos: totalNanosOverride,
                        currency: bill.currency ?? null,
                    },
                });

                try {
                    if (totalNanosOverride > 0) {
                        await recordUsageAndCharge({
                            requestId: ctx.requestId,
                            teamId: ctx.teamId,
                            cost_nanos: totalNanosOverride,
                        });
                    }
                } catch (chargeErr) {
                    console.error("recordUsageAndCharge failed", {
                        error: chargeErr,
                        requestId: ctx.requestId,
                        teamId: ctx.teamId,
                        endpoint: ctx.endpoint,
                        cost_nanos: totalNanosOverride,
                    });
                }
                return true;
            };

            if (!usageRaw) {
                const finalized = result.usageFinalizer ? await result.usageFinalizer() : null;
                if (await finalizeFromBill(finalized)) return;
                await handleSuccessAudit(
                    ctx,
                    result,
                    true,
                    null,
                    0,
                    0,
                    result.bill.currency ?? card?.currency ?? "USD",
                    null,
                    upstreamStatus,
                    result.bill.upstream_id ?? null
                );
                await emitGatewayRequestEvent({
                    ctx,
                    result,
                    statusCode: upstreamStatus,
                    success: true,
                    finishReason: null,
                    usage: null,
                    pricing: {
                        total_cents: 0,
                        total_nanos: 0,
                        currency: result.bill.currency ?? card?.currency ?? "USD",
                    },
                });
                return;
            }

            const { pricedUsage, totalCents, totalNanos, currency } = calculatePricing(
                shapedUsage,
                card,
                ctx.body
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

            result.bill.cost_cents = totalCents;
            result.bill.currency = currency;
            result.bill.usage = pricedUsage;

            await handleSuccessAudit(
                ctx,
                result,
                true,
                pricedUsage,
                totalCents,
                totalNanos,
                currency,
                null,
                upstreamStatus,
                result.bill.upstream_id ?? null
            );
            await emitGatewayRequestEvent({
                ctx,
                result,
                statusCode: upstreamStatus,
                success: true,
                finishReason: null,
                usage: pricedUsage,
                pricing: {
                    total_cents: totalCents,
                    total_nanos: totalNanos,
                    currency,
                },
            });

            try {
                if (totalNanos > 0) {
                    await recordUsageAndCharge({
                        requestId: ctx.requestId,
                        teamId: ctx.teamId,
                        cost_nanos: totalNanos,
                    });
                }
            } catch (chargeErr) {
                console.error("recordUsageAndCharge failed", {
                    error: chargeErr,
                    requestId: ctx.requestId,
                    teamId: ctx.teamId,
                    endpoint: ctx.endpoint,
                    cost_nanos: totalNanos,
                });
            }
        },
        timingHeader,
    });

    return resp;
}

export function handlePassthroughFallback(upstream: Response): Response {
    return passthrough(upstream);
}
