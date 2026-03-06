// src/lib/gateway/after.ts
// Purpose: After-stage logic for payload shaping, pricing, auditing, and streaming.
// Why: Keeps post-execution side-effects consistent.
// How: Shapes payloads, computes pricing, emits audits, and returns the final response.

import type { PipelineContext } from "../before/types";
import type { RequestResult } from "../execute";
import type { Endpoint } from "@core/types";

import { guardUpstreamStatus } from "./guards";
import { loadProviderPricing, calculatePricing } from "./pricing";
import { enrichSuccessPayload, extractFinishReason, formatClientPayload } from "./payload";
import { handleStreamResponse, handlePassthroughFallback } from "./stream";
import { handleSuccessAudit, handleFailureAudit } from "./audit";
import { makeHeaders, createResponse } from "./http";
import { recordUsageAndChargeOnce } from "./charge";
import { shapeUsageForClient } from "../usage";
import { logDebugEvent, previewValue } from "../debug";
import { normalizeFinishReason } from "../audit/normalize-finish-reason";
import { attachToolUsageMetrics, summarizeToolUsage } from "./tool-usage";
import { applyByokServiceFee } from "../pricing/byok-fee";
import { getBaseModel } from "../execute/utils";
import {
    maybeWriteStickyRoutingFromUsage,
    resolveCacheAwareRoutingPreference,
} from "../execute/sticky-routing";

function decodeBase64ToBytes(value: string): Uint8Array {
	const binary = atob(value);
	return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function normalizeWavChunkSizesIfNeeded(bytes: Uint8Array): Uint8Array {
	if (bytes.length < 44) return bytes;
	const isRiff =
		bytes[0] === 0x52 && // R
		bytes[1] === 0x49 && // I
		bytes[2] === 0x46 && // F
		bytes[3] === 0x46; // F
	const isWave =
		bytes[8] === 0x57 && // W
		bytes[9] === 0x41 && // A
		bytes[10] === 0x56 && // V
		bytes[11] === 0x45; // E
	if (!isRiff || !isWave) return bytes;

	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const riffSize = view.getUint32(4, true);
	const needsRiffPatch = riffSize === 0xffffffff;
	let needsPatch = needsRiffPatch;

	let dataChunkOffset = -1;
	let offset = 12;
	while (offset + 8 <= bytes.length) {
		const chunkId =
			String.fromCharCode(bytes[offset]) +
			String.fromCharCode(bytes[offset + 1]) +
			String.fromCharCode(bytes[offset + 2]) +
			String.fromCharCode(bytes[offset + 3]);
		const chunkSize = view.getUint32(offset + 4, true);
		if (chunkId === "data") {
			dataChunkOffset = offset;
			if (chunkSize === 0xffffffff) needsPatch = true;
			break;
		}
		const next = offset + 8 + chunkSize + (chunkSize % 2);
		if (next <= offset || next > bytes.length) break;
		offset = next;
	}

	if (dataChunkOffset < 0 && bytes.length >= 44) {
		const hasCanonicalDataChunk =
			bytes[36] === 0x64 && // d
			bytes[37] === 0x61 && // a
			bytes[38] === 0x74 && // t
			bytes[39] === 0x61; // a
		if (hasCanonicalDataChunk) {
			dataChunkOffset = 36;
			const dataSize = view.getUint32(40, true);
			if (dataSize === 0xffffffff) needsPatch = true;
		}
	}

	if (!needsPatch || dataChunkOffset < 0) return bytes;

	const patched = bytes.slice();
	const patchedView = new DataView(patched.buffer, patched.byteOffset, patched.byteLength);
	patchedView.setUint32(4, Math.max(0, patched.length - 8), true);
	const dataSizeOffset = dataChunkOffset + 4;
	const dataPayloadStart = dataChunkOffset + 8;
	patchedView.setUint32(dataSizeOffset, Math.max(0, patched.length - dataPayloadStart), true);
	return patched;
}

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
    const toolUsage = summarizeToolUsage({
        body: ctx.body,
        ir: result.ir,
        payload: payload,
    });

    // console.log("[DEBUG handleNonStreamResponse] usageNormalized:", usageNormalized);

    // Load pricing
    const card = await ctx.timer.span("after_load_pricing", () => loadProviderPricing(ctx, result));

    // Calculate pricing (with tier-based markup)
    const shapedUsage = attachToolUsageMetrics(
        shapeUsageForClient(usageNormalized, { endpoint: ctx.endpoint, body: ctx.body }),
        toolUsage
    );
    const tier = ctx.teamEnrichment?.tier ?? 'basic';
    const { pricedUsage, totalCents, totalNanos, currency } = await ctx.timer.span("after_calculate_pricing", () => calculatePricing(
        shapedUsage,
        card,
        ctx.body,
        tier
    ));
    const isByok = (result?.keySource ?? ctx.meta.keySource) === "byok";
    const pricedWithByok = await ctx.timer.span("after_apply_byok_fee", () => applyByokServiceFee({
        teamId: ctx.teamId,
        isByok,
        baseCostNanos: totalNanos,
        pricedUsage,
        currencyHint: currency,
    }));
    const pricedUsageFinalRaw = pricedWithByok.pricedUsage;
    const totalCentsFinal = pricedWithByok.totalCents;
    const totalNanosFinal = pricedWithByok.totalNanos;
    const currencyFinal = pricedWithByok.currency;
    if (ctx.meta?.debug?.enabled) {
        console.log("[gateway][pricing] non-stream priced usage", {
            requestId: ctx.requestId,
            endpoint: ctx.endpoint,
            provider: result.provider,
            pricing: (pricedUsageFinalRaw as any)?.pricing ?? null,
            totalCents: totalCentsFinal,
            totalNanos: totalNanosFinal,
            currency: currencyFinal,
        });
    }

    // console.log("[DEBUG handleNonStreamResponse] pricedUsage:", pricedUsage, "totalCents:", totalCents, "totalNanos:", totalNanos, "currency:", currency);

    const shapedUsageFinal = shapeUsageForClient(pricedUsageFinalRaw, { endpoint: ctx.endpoint, body: ctx.body });

    // Update payload with normalized usage
    payload.usage = shapedUsageFinal;
    const generationMs = ctx.meta.generation_ms ?? result.generationTimeMs ?? null;
    const latencyMs = ctx.meta.latency_ms ?? generationMs ?? null;
    const outputTokens = shapedUsageFinal?.output_tokens ?? shapedUsageFinal?.output_text_tokens ?? 0;
    const throughputTps = generationMs && generationMs > 0
        ? outputTokens / (generationMs / 1000)
        : null;
    payload.meta = {
        ...payload.meta,
        throughput_tps: throughputTps,
        generation_ms: generationMs,
        latency_ms: latencyMs,
    };
    if (ctx.meta?.debug?.enabled || ctx.meta.returnMeta) {
        payload.meta.routing = {
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
        };
    }

    // Update result billing
    result.bill.cost_cents = totalCentsFinal;
    result.bill.currency = currencyFinal;
    result.bill.usage = shapedUsageFinal;

    const cacheAwareRoutingEnabled = resolveCacheAwareRoutingPreference(
        ctx.body,
        typeof ctx.teamSettings?.cacheAwareRoutingEnabled === "boolean"
            ? ctx.teamSettings.cacheAwareRoutingEnabled
            : true
    );
    await ctx.timer.span("after_write_sticky_routing", async () => {
        try {
            await maybeWriteStickyRoutingFromUsage({
                teamId: ctx.teamId,
                endpoint: ctx.endpoint,
                model: getBaseModel(ctx.model),
                body: ctx.body,
                providerId: result.provider,
                usage: shapedUsageFinal,
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
    });

    // Extract finish reason and normalize it for consistent storage
    const finishReason = await ctx.timer.span("after_extract_finish_reason", () => {
        const rawFinishReason = extractFinishReason(payload);
        return normalizeFinishReason(rawFinishReason, result.provider);
    });

    const nativeResponseId = payload.nativeResponseId ?? null;

    // Audit success
    await ctx.timer.span("after_audit_success", () =>
        handleSuccessAudit(
            ctx,
            result,
            false, // isStream
            payload.usage,
            totalCentsFinal,
            totalNanosFinal,
            currencyFinal,
            finishReason,
            result.upstream.status,
            nativeResponseId ?? null,
            payload,
        )
    );
    // Record usage and charge wallet
    await ctx.timer.span("after_record_usage_charge", async () => {
        await recordUsageAndChargeOnce({
            ctx,
            costNanos: totalNanosFinal,
            endpoint: ctx.endpoint,
        });
    });

    const includeMeta = ctx.meta.returnMeta ?? false;

    const responseBody = formatClientPayload({
        ctx,
        result,
        payload,
        includeMeta,
    });

    if (ctx.endpoint === "audio.speech") {
        const audioBase64 = typeof payload?.audio_base64 === "string"
            ? payload.audio_base64
            : (typeof payload?.audio?.data === "string" ? payload.audio.data : null);
        if (audioBase64) {
            const mimeType = payload?.mime_type ?? payload?.audio?.mime_type ?? payload?.audio?.mimeType ?? "audio/mpeg";
            const headers = makeHeaders(timingHeader);
            headers.set("Content-Type", mimeType);
            let bytes = decodeBase64ToBytes(audioBase64);
            if (mimeType.toLowerCase().includes("wav") || mimeType.toLowerCase().includes("wave")) {
                bytes = normalizeWavChunkSizesIfNeeded(bytes);
            }
            const responseBytes = Uint8Array.from(bytes);
            return new Response(responseBytes, {
                status: result.upstream.status,
                headers,
            });
        }
    }

    if (ctx.meta?.debug?.enabled) {
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











