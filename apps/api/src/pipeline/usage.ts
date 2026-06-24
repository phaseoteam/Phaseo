// Purpose: Pipeline module for the gateway request lifecycle.
// Why: Keeps stage-specific logic isolated and testable.
// How: Exposes helpers used by before/execute/after orchestration.

import type { Endpoint } from "@core/types";
import {
    resolveCanonicalTokenUsage,
    resolveRequestCountUsage,
} from "@core/usage-normalization";

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

const CACHED_READ_SUBSET_PROVIDERS = new Set([
    "x-ai",
    "openai",
    "google",
    "google-ai-studio",
]);

/**
 * Remove billing outputs from a usage payload so downstream pricing
 * always derives from raw usage meters.
 */
export function stripUsagePricing(usage: any) {
    if (!usage || typeof usage !== "object") return usage;
    const base: any = { ...usage };
    delete base.pricing;
    delete base.pricing_breakdown;
    delete base.cost_usd;
    delete base.cost_usd_str;
    delete base.cost_cents;
    delete base.currency;
    return base;
}

/**
 * Shape usage for client-facing responses:
 * - Prefer OpenAI-style keys (input_tokens, output_tokens, total_tokens)
 * - Add detailed breakdowns under input_tokens_details/output_tokens_details
 * - Omit legacy duplicate token aliases from the persisted/public shape.
 */
export function shapeUsageForClient(
    usage: any,
    ctx?: { endpoint?: Endpoint; body?: any; includeInternalHints?: boolean },
) {
    if (!usage || typeof usage !== "object") return usage;

    const base: any = { ...usage };
    const shaped: any = {};
    const textEndpoint =
        ctx?.endpoint === "chat.completions" ||
        ctx?.endpoint === "responses" ||
        ctx?.endpoint === "interactions" ||
        ctx?.endpoint === "messages";

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

    if (ctx?.endpoint === "responses" || ctx?.endpoint === "interactions") {
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

    const canonicalTokens = resolveCanonicalTokenUsage(base);
    const tokensIn = canonicalTokens.inputTokens;
    const tokensOut = canonicalTokens.outputTokens;
    const totalTokens = canonicalTokens.totalTokens;

    const cachedRead =
        pickNumber(base, "cached_read_text_tokens") ??
        pickNumber(base, "input_tokens_details.cached_tokens") ??
        pickNumber(base, "prompt_tokens_details.cached_tokens") ??
        pickNumber(base, "cached_tokens") ??
        pickNumber(base, "prompt_cache_hit_tokens") ??
        pickNumber(base, "cache_read_input_tokens");
    const cachedWrite =
        pickNumber(base, "cached_write_text_tokens") ??
        pickNumber(base, "output_tokens_details.cached_tokens") ??
        pickNumber(base, "input_tokens_details.cache_creation_input_tokens") ??
        pickNumber(base, "prompt_tokens_details.cache_creation_input_tokens") ??
        pickNumber(base, "input_tokens_details.cache_creation_tokens") ??
        pickNumber(base, "prompt_tokens_details.cache_creation_tokens") ??
        pickNumber(base, "cache_creation_input_tokens");
    const cachedWrite5m =
        pickNumber(base, "cached_write_text_tokens_5m") ??
        pickNumber(base, "_ext.cachedWriteTokens5m") ??
        pickNumber(base, "cache_creation.ephemeral_5m_input_tokens") ??
        pickNumber(base, "cache_creation_5m_input_tokens") ??
        pickNumber(base, "cache_creation_ephemeral_5m_input_tokens");
    const cachedWrite1h =
        pickNumber(base, "cached_write_text_tokens_1h") ??
        pickNumber(base, "_ext.cachedWriteTokens1h") ??
        pickNumber(base, "cache_creation.ephemeral_1h_input_tokens") ??
        pickNumber(base, "cache_creation_1h_input_tokens") ??
        pickNumber(base, "cache_creation_ephemeral_1h_input_tokens");
    const reasoningTokens = pickNumber(base, "reasoning_tokens") ?? pickNumber(base, "output_tokens_details.reasoning_tokens");
    const cachedReadIsSubsetHint = ((): boolean => {
        const explicit = (base as any).cached_read_tokens_are_subset_of_input;
        if (explicit === false) return false;
        if (explicit === true) return true;
        const providerHintRaw =
            (base as any)._provider_id ??
            (base as any).provider_id ??
            (base as any).provider;
        const providerHint = typeof providerHintRaw === "string" ? providerHintRaw.toLowerCase() : "";
        return CACHED_READ_SUBSET_PROVIDERS.has(providerHint);
    })();

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

    const passthroughKeys = [
        "requests",
        "embedding_tokens",
        "input_characters",
        "output_characters",
        "total_characters",
        "characters",
        "input_quad_tokens",
        "output_quad_tokens",
        "total_quad_tokens",
        "text_quad_tokens",
        "rerank_quad_tokens",
        "embedding_quad_tokens",
        "moderation_quad_tokens",
        "ocr_quad_tokens",
        "cached_write_text_tokens",
        "cached_write_text_tokens_5m",
        "cached_write_text_tokens_1h",
        "cache_creation",
        "output_image",
        "input_image_pixels",
        "output_image_pixels",
        "output_video_seconds",
        "output_audio_seconds",
        "image_pixels",
        "input_image_megapixels",
        "output_image_megapixels",
        "image_megapixels",
        "input_audio_seconds",
        "audio_seconds",
        "input_audio_minutes",
        "output_audio_minutes",
        "audio_minutes",
        "input_video_seconds",
        "video_seconds",
        "input_video_pixels",
        "output_video_pixels",
        "video_pixels",
        "input_video_pixel_seconds",
        "output_video_pixel_seconds",
        "video_pixel_seconds",
        "input_pages",
        "output_pages",
        "pages",
        "doc_size_bytes",
        "document_bytes",
        "bfl_credits",
        "server_tool_use",
        "service_tier",
        "serviceTier",
        "pricing",
        "pricing_breakdown",
    ];
    for (const key of passthroughKeys) {
        if (base[key] !== undefined) shaped[key] = base[key];
    }
    if (cachedWrite5m !== undefined) shaped.cached_write_text_tokens_5m = cachedWrite5m;
    if (cachedWrite1h !== undefined) shaped.cached_write_text_tokens_1h = cachedWrite1h;
    if (
        shaped.cached_write_text_tokens == null &&
        (cachedWrite5m !== undefined || cachedWrite1h !== undefined)
    ) {
        shaped.cached_write_text_tokens = (cachedWrite5m ?? 0) + (cachedWrite1h ?? 0);
    }

    shaped.input_tokens = tokensIn;
    shaped.output_tokens = tokensOut;
    shaped.total_tokens = totalTokens;
    if (shaped.requests == null) {
        const requestCount = resolveRequestCountUsage(base);
        if (typeof requestCount === "number") {
            shaped.requests = requestCount;
        } else if (textEndpoint) {
            // Ensure text surfaces always expose at least one request meter when usage exists
            // but token counts are missing or zero.
            shaped.requests = 1;
        }
    }

    if (Object.keys(inputDetails).length) {
        shaped.input_tokens_details = inputDetails;
    }
    if (Object.keys(outputDetails).length) {
        shaped.output_tokens_details = outputDetails;
    }

    if (ctx?.includeInternalHints && cachedReadIsSubsetHint && cachedRead !== undefined) {
        shaped.cached_read_tokens_are_subset_of_input = true;
    }

    return shaped;
}
