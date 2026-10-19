// Purpose: Pipeline module for the gateway request lifecycle.
// Why: Keeps stage-specific logic isolated and testable.
// How: Exposes helpers used by before/execute/after orchestration.

import type { Endpoint } from "@core/types";
import {
    resolveCanonicalTokenUsage,
    resolveRequestCountUsage,
} from "@core/usage-normalization";
import { resolveCacheTokenUsage, totalInputTokens } from "@core/cache-usage";

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

/** Media inputs counted from the request body, used when upstream usage omits them. */
export type RequestMediaCounts = { images: number; audio: number; video: number };

/**
 * Count image/audio/video inputs in a chat.completions or responses request
 * body (null for other endpoints). The result only depends on the body, so
 * per-request callers that shape usage several times (streaming) compute it
 * once and pass it as `mediaCounts`.
 */
export function countRequestMediaInputs(endpoint: Endpoint | undefined, body: any): RequestMediaCounts | null {
    if (endpoint === "chat.completions") {
        const messages: any[] = Array.isArray(body?.messages) ? body.messages : [];
        let img = 0;
        let audio = 0;
        let video = 0;
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
        return { images: img, audio, video };
    }

    if (endpoint === "responses") {
        const items: any[] = Array.isArray(body?.input) ? body.input : (Array.isArray(body?.input_items) ? body.input_items : []);
        let img = 0;
        let audio = 0;
        let video = 0;

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
        return { images: img, audio, video };
    }

    return null;
}

/**
 * Shape usage for client-facing responses:
 * - Prefer OpenAI-style keys (input_tokens, output_tokens, total_tokens)
 * - Add detailed breakdowns under input_tokens_details/output_tokens_details
 * - Omit legacy duplicate token aliases from the persisted/public shape.
 */
export function shapeUsageForClient(
    usage: any,
    ctx?: {
        endpoint?: Endpoint;
        body?: any;
        includeInternalHints?: boolean;
        /** Precomputed countRequestMediaInputs(endpoint, body) for this request. */
        mediaCounts?: RequestMediaCounts | null;
    },
) {
    if (!usage || typeof usage !== "object") return usage;

    const base: any = { ...usage };
    const shaped: any = {};
    const textEndpoint =
        ctx?.endpoint === "chat.completions" ||
        ctx?.endpoint === "responses" ||
        ctx?.endpoint === "messages";

    // Derive multimodal counts when upstream usage omits them.
    const mediaCounts = ctx?.mediaCounts !== undefined
        ? ctx.mediaCounts
        : countRequestMediaInputs(ctx?.endpoint, ctx?.body);
    if (mediaCounts) {
        // Upstream-provided counts win; body counts only fill missing meters.
        if (mediaCounts.images && base.input_image_count == null) base.input_image_count = mediaCounts.images;
        if (mediaCounts.audio && base.input_audio_count == null) base.input_audio_count = mediaCounts.audio;
        if (mediaCounts.video && base.input_video_count == null) base.input_video_count = mediaCounts.video;
    }

    const canonicalTokens = resolveCanonicalTokenUsage(base);
    // Client usage follows OpenAI semantics on every surface: input_tokens counts uncached
    // input, cache reads and cache writes. Providers that report the cache on top of input
    // (Anthropic) are converted here, so shaping is idempotent and pricing reads one form.
    const cache = resolveCacheTokenUsage(base, canonicalTokens.inputTokens, { readSubsetDefault: true });
    const tokensIn = totalInputTokens(canonicalTokens.inputTokens, cache);
    const tokensOut = canonicalTokens.outputTokens;
    const totalTokens = canonicalTokens.totalTokens + (tokensIn - canonicalTokens.inputTokens);

    const cachedRead = cache.readTokens;
    const cachedWrite = cache.writeTokens;
    const cachedWrite5m = cache.write5mTokens;
    const cachedWrite1h = cache.write1hTokens;
    const reasoningTokens =
        pickNumber(base, "reasoning_tokens") ??
        pickNumber(base, "output_tokens_details.reasoning_tokens") ??
        pickNumber(base, "completion_tokens_details.reasoning_tokens");

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
    const nativeDecisions = ctx?.endpoint === "decisions" && Array.isArray(ctx.body?.questions);
    if (nativeDecisions) {
        inputDetails.cached_tokens = cachedRead ?? 0;
        inputDetails.cache_write_tokens = pickNumber(base, "input_tokens_details.cache_write_tokens") ?? cachedWrite ?? 0;
    }
    if (cachedRead !== undefined) inputDetails.cached_tokens = cachedRead;
    if (cachedWrite !== undefined) inputDetails.cache_write_tokens = cachedWrite;
    if (inputImages !== undefined) inputDetails.input_images = inputImages;
    if (inputAudio !== undefined) inputDetails.input_audio = inputAudio;
    if (inputVideo !== undefined) inputDetails.input_videos = inputVideo;

    const outputDetails: Record<string, number> = {};
    if (nativeDecisions) outputDetails.reasoning_tokens = reasoningTokens ?? 0;
    if (reasoningTokens !== undefined) outputDetails.reasoning_tokens = reasoningTokens;
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
		"input_image",
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
        "deepinfra_cost_usd",
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

    // The shaped totals above already include reads and writes, so the hints are always true
    // here. They override any raw-usage hints this object is merged over before pricing.
    if (ctx?.includeInternalHints && cachedRead !== undefined) {
        shaped.cached_read_tokens_are_subset_of_input = true;
    }
    if (ctx?.includeInternalHints && cachedWrite !== undefined) {
        shaped.cached_write_tokens_are_subset_of_input = true;
    }

    return shaped;
}
