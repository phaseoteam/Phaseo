// src/lib/gateway/after.ts
import type { PipelineContext } from "../before/types";
import type { RequestResult } from "../execute";
import type { Endpoint } from "@core/types";

import { guardUpstreamStatus } from "./guards";
import { loadProviderPricing, calculatePricing } from "./pricing";
import { enrichSuccessPayload, extractFinishReason, formatClientPayload } from "./payload";
import { handleStreamResponse, handlePassthroughFallback } from "./stream";
import { handleSuccessAudit, handleFailureAudit } from "./audit";
import { makeHeaders, createResponse } from "./http";
import { recordUsageAndCharge } from "../pricing/persist";
import { shapeUsageForClient } from "../usage";
import { emitGatewayRequestEvent } from "@observability/events";
import { logDebugEvent, previewValue } from "../debug";

export async function finalizeRequest(args: {
    pre: { ok: true; ctx: PipelineContext };
    exec: { ok: true; result: RequestResult };
    endpoint: Endpoint;
    timingHeader?: string;
}): Promise<Response> {
    const ctx = args.pre.ctx;
    const result = args.exec.result;

    // 1) Guard: Check upstream status
    const statusGuard = await guardUpstreamStatus(ctx, result, args.timingHeader);
    if (!statusGuard.ok) return (statusGuard as { ok: false; response: Response }).response;

    // 2) Handle streaming response
    if (ctx.stream) {
        const card = await loadProviderPricing(ctx, result);
        return await handleStreamResponse(ctx, result, card, args.timingHeader);
    }

    // 3) Handle non-streaming response
    if (result.normalized && !ctx.stream) {
        return await handleNonStreamResponse(ctx, result, args.timingHeader);
    }

    // 4) Passthrough fallback for endpoints where binary/media passthrough is expected
    const passthroughOk = ["audio.speech", "audio.transcription", "audio.translations", "video.generation", "images.edits"].includes(ctx.endpoint);
    if (passthroughOk) {
        return handlePassthroughFallback(result.upstream);
    }

    // 5) If we reach this state without a normalized payload, treat as failure.
    const status = 502;
    const errorCode = "normalization_failed";
    const errorMessage = "Gateway could not normalize upstream response.";

    await handleFailureAudit(
        ctx,
        result,
        status,
        "gateway",
        errorCode,
        errorMessage
    );

    const headers = makeHeaders(args.timingHeader);
    return createResponse(
        {
            requestId: ctx.requestId,
            error: errorCode,
            message: errorMessage,
            upstreamStatus: result.upstream.status ?? null,
        },
        status,
        headers
    );
}

async function handleNonStreamResponse(
    ctx: PipelineContext,
    result: RequestResult,
    timingHeader?: string
): Promise<Response> {
    // Enrich payload
    const payload = await ctx.timer.span("after_enrich_payload", () => enrichSuccessPayload(ctx, result));
    const usageNormalized = payload?.usage ?? {};

    // console.log("[DEBUG handleNonStreamResponse] usageNormalized:", usageNormalized);

    // Load pricing
    const card = await ctx.timer.span("after_load_pricing", () => loadProviderPricing(ctx, result));

    // Calculate pricing
    const shapedUsage = shapeUsageForClient(usageNormalized, { endpoint: ctx.endpoint, body: ctx.body });
    const { pricedUsage, totalCents, totalNanos, currency } = await ctx.timer.span("after_calculate_pricing", () => calculatePricing(
        shapedUsage,
        card,
        ctx.body
    ));
    if (ctx.meta?.debug) {
        console.log("[gateway][pricing] non-stream priced usage", {
            requestId: ctx.requestId,
            endpoint: ctx.endpoint,
            provider: result.provider,
            pricing: (pricedUsage as any)?.pricing ?? null,
            totalCents,
            totalNanos,
            currency,
        });
    }

    // console.log("[DEBUG handleNonStreamResponse] pricedUsage:", pricedUsage, "totalCents:", totalCents, "totalNanos:", totalNanos, "currency:", currency);

    const shapedUsageFinal = shapeUsageForClient(pricedUsage, { endpoint: ctx.endpoint, body: ctx.body });

    // Update payload with normalized usage
    payload.usage = shapedUsageFinal;
    const generationMs = ctx.meta.generation_ms ?? result.generationTimeMs ?? null;
    const latencyMs = ctx.meta.latency_ms ?? generationMs ?? null;
    const outputTokens = shapedUsageFinal.output_tokens ?? shapedUsageFinal.output_text_tokens ?? 0;
    const throughputTps = generationMs && generationMs > 0
        ? outputTokens / (generationMs / 1000)
        : null;
    payload.meta = {
        ...payload.meta,
        throughput_tps: throughputTps,
        generation_ms: generationMs,
        latency_ms: latencyMs,
    };

    // Update result billing
    result.bill.cost_cents = totalCents;
    result.bill.currency = currency;
    result.bill.usage = shapedUsageFinal;

    // Extract finish reason
    const finishReason = await ctx.timer.span("after_extract_finish_reason", () => extractFinishReason(payload));

    const nativeResponseId = payload.nativeResponseId ?? null;

    // Audit success
    await ctx.timer.span("after_audit_success", () =>
        handleSuccessAudit(
            ctx,
            result,
            false, // isStream
            payload.usage,
            totalCents,
            totalNanos,
            currency,
            finishReason,
            result.upstream.status,
            nativeResponseId ?? null
        )
    );
    await emitGatewayRequestEvent({
        ctx,
        result,
        statusCode: result.upstream.status,
        success: true,
        finishReason,
        usage: shapedUsageFinal,
        pricing: {
            total_cents: totalCents,
            total_nanos: totalNanos,
            currency,
        },
    });

    // Record usage and charge wallet
    await ctx.timer.span("after_record_usage_charge", async () => {
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
            // Continue with response even if charging fails
        }
    });

    const includeUsage = ctx.meta.returnUsage ?? false;
    const includeMeta = ctx.meta.returnMeta ?? false;

    const responseBody = formatClientPayload({
        ctx,
        result,
        payload,
        includeUsage,
        includeMeta,
    });

    if (ctx.meta?.debug) {
        void logDebugEvent("response.pipeline", {
            requestId: ctx.requestId,
            endpoint: ctx.endpoint,
            provider: result.provider,
            upstreamStatus: result.upstream.status,
            rawResponse: previewValue(result.rawResponse),
            ir: previewValue(result.ir),
            normalizedPayload: previewValue(payload),
            clientResponse: previewValue(responseBody),
        });
    }

    const headers = makeHeaders(timingHeader);
    return ctx.timer.span("after_create_response", () => createResponse(responseBody, result.upstream.status, headers));
}
