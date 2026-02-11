// Purpose: Pipeline module for the gateway request lifecycle.
// Why: Keeps stage-specific logic isolated and testable.
// How: Exposes helpers used by before/execute/after orchestration.

import type { Endpoint } from "@core/types";

const pickNumber = (obj: any, path: string): number | undefined => {
    if (!obj || typeof obj !== "object") return undefined;
    const parts = path.split(".");
    let cur: any = obj;
    for (const part of parts) {
        if (cur == null || typeof cur !== "object") return undefined;
        cur = (cur as any)[part];
    }
    return typeof cur === "number" ? cur : undefined;
};

/**
 * Shape usage for client-facing responses:
 * - Prefer OpenAI-style keys (input_tokens, output_tokens, total_tokens)
 * - Add detailed breakdowns under input_details/output_tokens_details
 * - Preserve legacy keys used for billing/analytics.
 */
export function shapeUsageForClient(usage: any, ctx?: { endpoint?: Endpoint; body?: any }) {
    if (!usage || typeof usage !== "object") return usage;

    const base: any = { ...usage };

    // Derive multimodal counts when upstream usage omits them.
    if (ctx?.endpoint === "chat.completions") {
        const messages: any[] = Array.isArray(ctx.body?.messages) ? ctx.body.messages : [];
        let img = base.input_image_count ?? 0;
        let audio = base.input_audio_count ?? 0;
        let video = base.input_video_count ?? 0;
        for (const msg of messages) {
            const content = (msg && msg.content) as any;
            if (!content) continue;
            const parts = Array.isArray(content) ? content : [];
            for (const part of parts) {
                if (!part || typeof part !== "object") continue;
                switch (part.type) {
                    case "image_url": img += 1; break;
                    case "input_audio": audio += 1; break;
                    case "input_video": video += 1; break;
                    default: break;
                }
            }
        }
        if (img && base.input_image_count == null) base.input_image_count = img;
        if (audio && base.input_audio_count == null) base.input_audio_count = audio;
        if (video && base.input_video_count == null) base.input_video_count = video;
    }

    if (ctx?.endpoint === "responses") {
        const items: any[] = Array.isArray(ctx.body?.input) ? ctx.body.input : (Array.isArray(ctx.body?.input_items) ? ctx.body.input_items : []);
        let img = base.input_image_count ?? 0;
        let audio = base.input_audio_count ?? 0;
        let video = base.input_video_count ?? 0;

        const inspectContent = (node: any) => {
            if (!node) return;
            if (Array.isArray(node)) {
                for (const part of node) inspectContent(part);
                return;
            }
            if (typeof node !== "object") return;
            switch ((node as any).type) {
                case "input_image":
                case "image_url":
                    img += 1;
                    break;
                case "input_audio":
                    audio += 1;
                    break;
                case "input_video":
                    video += 1;
                    break;
                case "message":
                    inspectContent((node as any).content);
                    break;
                default:
                    break;
            }
        };

        for (const item of items) {
            inspectContent(item);
            if (item && Array.isArray((item as any).content)) inspectContent((item as any).content);
        }

        if (img && base.input_image_count == null) base.input_image_count = img;
        if (audio && base.input_audio_count == null) base.input_audio_count = audio;
        if (video && base.input_video_count == null) base.input_video_count = video;
    }

    const tokensIn = pickNumber(base, "input_tokens") ?? pickNumber(base, "input_text_tokens") ?? pickNumber(base, "prompt_tokens") ?? 0;
    const tokensOut = pickNumber(base, "output_tokens") ?? pickNumber(base, "output_text_tokens") ?? pickNumber(base, "completion_tokens") ?? 0;
    const totalTokens = pickNumber(base, "total_tokens") ?? tokensIn + tokensOut;

    const cachedRead = pickNumber(base, "cached_read_text_tokens") ?? pickNumber(base, "input_tokens_details.cached_tokens");
    const cachedWrite = pickNumber(base, "cached_write_text_tokens") ?? pickNumber(base, "output_tokens_details.cached_tokens");
    const reasoningTokens = pickNumber(base, "reasoning_tokens") ?? pickNumber(base, "output_tokens_details.reasoning_tokens");

    // Multimodal signals (prefer tokenized meters, then detail fields, then count-based fallbacks).
    const inputImageTokens =
        pickNumber(base, "input_image_tokens") ??
        pickNumber(base, "input_tokens_details.input_images") ??
        pickNumber(base, "input_details.input_images");
    const inputAudioTokens =
        pickNumber(base, "input_audio_tokens") ??
        pickNumber(base, "input_tokens_details.input_audio") ??
        pickNumber(base, "input_details.input_audio");
    const inputVideoTokens =
        pickNumber(base, "input_video_tokens") ??
        pickNumber(base, "input_tokens_details.input_videos") ??
        pickNumber(base, "input_details.input_videos");
    const outputImageTokens =
        pickNumber(base, "output_image_tokens") ??
        pickNumber(base, "output_tokens_details.output_images") ??
        pickNumber(base, "completion_tokens_details.output_images");
    const outputAudioTokens =
        pickNumber(base, "output_audio_tokens") ??
        pickNumber(base, "output_tokens_details.output_audio") ??
        pickNumber(base, "completion_tokens_details.output_audio");
    const outputVideoTokens =
        pickNumber(base, "output_video_tokens") ??
        pickNumber(base, "output_tokens_details.output_videos") ??
        pickNumber(base, "completion_tokens_details.output_videos");

    const inputImages = inputImageTokens ?? pickNumber(base, "input_image_count");
    const inputAudio = inputAudioTokens ?? pickNumber(base, "input_audio_count");
    const inputVideo = inputVideoTokens ?? pickNumber(base, "input_video_count");
    const outputImages = outputImageTokens ?? pickNumber(base, "output_image_count");
    const outputAudio = outputAudioTokens ?? pickNumber(base, "output_audio_count");
    const outputVideo = outputVideoTokens ?? pickNumber(base, "output_video_count");

    const inputDetails: Record<string, number> = {};
    if (cachedRead !== undefined) inputDetails.cached_tokens = cachedRead;
    if (inputImages !== undefined) inputDetails.input_images = inputImages;
    if (inputAudio !== undefined) inputDetails.input_audio = inputAudio;
    if (inputVideo !== undefined) inputDetails.input_videos = inputVideo;

    const outputDetails: Record<string, number> = {};
    if (reasoningTokens !== undefined) outputDetails.reasoning_tokens = reasoningTokens;
    if (cachedWrite !== undefined) outputDetails.cached_tokens = cachedWrite;
    if (outputImages !== undefined) outputDetails.output_images = outputImages;
    if (outputAudio !== undefined) outputDetails.output_audio = outputAudio;
    if (outputVideo !== undefined) outputDetails.output_videos = outputVideo;

    base.input_tokens = tokensIn;
    base.output_tokens = tokensOut;
    base.total_tokens = totalTokens;

    // Preserve legacy fields for billing/past consumers
    base.input_text_tokens = pickNumber(base, "input_text_tokens") ?? tokensIn;
    base.output_text_tokens = pickNumber(base, "output_text_tokens") ?? tokensOut;
    if (cachedRead !== undefined) base.cached_read_text_tokens = cachedRead;
    if (cachedWrite !== undefined) base.cached_write_text_tokens = cachedWrite;
    if (reasoningTokens !== undefined) base.reasoning_tokens = reasoningTokens;
    if (inputImageTokens !== undefined) base.input_image_tokens = inputImageTokens;
    if (inputAudioTokens !== undefined) base.input_audio_tokens = inputAudioTokens;
    if (inputVideoTokens !== undefined) base.input_video_tokens = inputVideoTokens;
    if (outputImageTokens !== undefined) base.output_image_tokens = outputImageTokens;
    if (outputAudioTokens !== undefined) base.output_audio_tokens = outputAudioTokens;
    if (outputVideoTokens !== undefined) base.output_video_tokens = outputVideoTokens;

    if (Object.keys(inputDetails).length) {
        base.input_tokens_details = inputDetails;
        base.input_details = base.input_details ?? inputDetails; // legacy alias
    }
    if (Object.keys(outputDetails).length) {
        base.output_tokens_details = outputDetails;
        base.completion_tokens_details = base.completion_tokens_details ?? outputDetails; // legacy alias
    }

    return base;
}

