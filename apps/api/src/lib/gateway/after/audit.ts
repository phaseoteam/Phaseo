// lib/gateway/after/audit.ts
import { auditSuccess, auditFailure } from "../audit";
import type { PipelineContext } from "../before/types";
import type { RequestResult } from "../execute";

export async function handleFailureAudit(
    ctx: PipelineContext,
    result: RequestResult,
    upstreamStatus: number,
    attribution: string,
    errorCode: string,
    errorMessage: string
) {
    const beforeMs = (ctx as any)?.timing?.before?.total_ms ?? 0;
    const execMs = (ctx as any)?.timing?.execute?.total_ms ?? 0;
    const genMs = (ctx as any)?.timing?.execute?.adapter_ms ?? null;
    const internalLatencyMs = (ctx as any)?.timing?.internal_latency_ms ?? null;

    // Use meta values if available, otherwise fall back to timing calculations
    const generationMs = ctx.meta.generation_ms ?? (genMs ? Math.round(genMs) : null);
    const latencyMs = ctx.meta.latency_ms ?? Math.round(beforeMs + execMs);

    try {
        await auditFailure({
            stage: "execute",
            requestId: ctx.requestId,
            teamId: ctx.teamId,
            endpoint: ctx.endpoint,
            model: ctx.model,
            stream: ctx.stream,
            statusCode: upstreamStatus,
            errorCode: `${attribution}:${errorCode}`,
            errorMessage,
            latencyMs,
            generationMs,
            internalLatencyMs,
            byok: (result?.keySource ?? ctx.meta.keySource) === "byok",
            keyId: ctx.meta.apiKeyId,
        });
    } catch (auditErr) {
        console.error("auditFailure failed", auditErr);
    }
}

export async function handleSuccessAudit(
    ctx: PipelineContext,
    result: RequestResult,
    isStream: boolean,
    usagePriced: any,
    totalCents: number,
    totalNanos: number,
    currency: string,
    finishReason: string | null,
    statusCode: number,
    nativeResponseId?: string | null
) {
    const byok = (result?.keySource ?? ctx.meta.keySource) === "byok";
    const execTiming = (ctx as any)?.timing?.execute ?? {};
    const internalLatencyMs = (ctx as any)?.timing?.internal_latency_ms ?? null;

    // Use meta values if available, otherwise fall back to timing calculations
    const generationMs = ctx.meta.generation_ms ?? Math.round(execTiming?.adapter_ms ?? result.generationTimeMs ?? 0);
    const latencyMs = ctx.meta.latency_ms ?? (isStream
        ? Math.round(execTiming?.total_ms ?? 0) + Math.round((ctx as any)?.timing?.before?.total_ms ?? 0)
        : Math.round(execTiming?.total_ms ?? generationMs));

    // Enrich usage with multimodal signals visible at the gateway layer (e.g., image/audio/video inputs).
    const usageWithMultimodal = enrichUsageWithMultimodal(ctx, usagePriced);

    // Calculate throughput (tokens/sec) using output tokens only to reflect generation speed.
    if (ctx.meta.throughput_tps === undefined && generationMs > 0) {
        const usage = usageWithMultimodal ?? {};
        const tokensOut = Number(usage.output_tokens ?? usage.output_text_tokens ?? usage.completion_tokens ?? 0);
        ctx.meta.throughput_tps = tokensOut / (generationMs / 1000);
    }

    // console.log("[DEBUG handleSuccessAudit] Calling auditSuccess with:", {
    //     usagePriced: usageWithMultimodal,
    //     totalCents,
    //     totalNanos,
    //     currency,
    //     throughput: ctx.meta.throughput_tps,
    //     keyId: ctx.meta.apiKeyId,
    //     nativeResponseId: nativeResponseId ?? null,
    // });

    try {
        await auditSuccess({
            requestId: ctx.requestId,
            teamId: ctx.teamId,
            provider: result.provider,
            model: ctx.model,
            endpoint: ctx.endpoint,
            stream: isStream,
            byok,
            nativeResponseId: nativeResponseId ?? null,
            appTitle: ctx.meta.appTitle ?? null,
            referer: ctx.meta.referer ?? null,
            generationMs,
            latencyMs,
            internalLatencyMs,
            usagePriced: usageWithMultimodal,
            totalCents,
            totalNanos,
            currency,
            finishReason,
            statusCode,
            throughput: ctx.meta.throughput_tps ?? null,
            keyId: ctx.meta.apiKeyId,
        });
    } catch (auditErr) {
        console.error("auditSuccess failed", auditErr);
    }
}

function enrichUsageWithMultimodal(ctx: PipelineContext, usagePriced: any): any {
    try {
        const base = usagePriced && typeof usagePriced === "object" ? { ...usagePriced } : {};

        if (ctx.endpoint === "chat.completions") {
            const body: any = ctx.body ?? {};
            const messages: any[] = Array.isArray(body.messages) ? body.messages : [];

            let inputImages = 0;
            let inputAudio = 0;
            let inputVideo = 0;

            for (const msg of messages) {
                const content = (msg && msg.content) as any;
                if (!content) continue;

                if (Array.isArray(content)) {
                    for (const part of content) {
                        if (!part) continue;
                        switch (part.type) {
                            case "image_url":
                                inputImages += 1;
                                break;
                            case "input_audio":
                                inputAudio += 1;
                                break;
                            case "input_video":
                                inputVideo += 1;
                                break;
                            default:
                                break;
                        }
                    }
                }
            }

            if (inputImages > 0 && base.input_image_count == null) base.input_image_count = inputImages;
            if (inputAudio > 0 && base.input_audio_count == null) base.input_audio_count = inputAudio;
            if (inputVideo > 0 && base.input_video_count == null) base.input_video_count = inputVideo;
        }

        if (ctx.endpoint === "responses") {
            const body: any = ctx.body ?? {};
            const items: any[] = Array.isArray(body.input) ? body.input : (Array.isArray(body.input_items) ? body.input_items : []);
            let inputImages = 0;
            let inputAudio = 0;
            let inputVideo = 0;

            const inspectContent = (content: any) => {
                if (!content) return;
                if (Array.isArray(content)) {
                    for (const part of content) inspectContent(part);
                    return;
                }
                switch (content.type) {
                    case "input_image":
                    case "image_url":
                        inputImages += 1;
                        break;
                    case "input_audio":
                        inputAudio += 1;
                        break;
                    case "input_video":
                        inputVideo += 1;
                        break;
                    case "message":
                        inspectContent((content as any).content);
                        break;
                    default:
                        break;
                }
            };

            for (const item of items) {
                inspectContent(item);
                if (item && Array.isArray((item as any).content)) {
                    inspectContent((item as any).content);
                }
            }

            if (inputImages > 0 && base.input_image_count == null) base.input_image_count = inputImages;
            if (inputAudio > 0 && base.input_audio_count == null) base.input_audio_count = inputAudio;
            if (inputVideo > 0 && base.input_video_count == null) base.input_video_count = inputVideo;
        }

        return base;
    } catch (err) {
        console.error("enrichUsageWithMultimodal error", err);
        return usagePriced;
    }
}
