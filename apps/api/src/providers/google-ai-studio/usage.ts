// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import type { IRUsage } from "@core/ir";
import { normalizeGoogleServiceTier } from "@executors/google/shared/service-tier";

type ModalityTokenCount = {
    modality?: string;
    tokenCount?: number;
};

type UsageMetadata = {
	serviceTier?: string;
	service_tier?: string;
	trafficType?: string;
    promptTokenCount?: number;
    cachedContentTokenCount?: number;
    candidatesTokenCount?: number;
    toolUsePromptTokenCount?: number;
    thoughtsTokenCount?: number;
    thoughtTokenCount?: number;
    totalTokenCount?: number;
    promptTokensDetails?: ModalityTokenCount[];
    cacheTokensDetails?: ModalityTokenCount[];
    candidatesTokensDetails?: ModalityTokenCount[];
    toolUsePromptTokensDetails?: ModalityTokenCount[];
};

type UsageShape = Record<string, number>;

const modalityToMeter: Record<string, { input: string; output: string; cached: string }> = {
    MODALITY_UNSPECIFIED: { input: "input_text_tokens", output: "output_text_tokens", cached: "cached_read_text_tokens" },
    TEXT: { input: "input_text_tokens", output: "output_text_tokens", cached: "cached_read_text_tokens" },
    IMAGE: { input: "input_image_tokens", output: "output_image_tokens", cached: "cached_read_image_tokens" },
    VIDEO: { input: "input_video_tokens", output: "output_video_tokens", cached: "cached_read_video_tokens" },
    AUDIO: { input: "input_audio_tokens", output: "output_audio_tokens", cached: "cached_read_audio_tokens" },
    DOCUMENT: { input: "input_text_tokens", output: "output_text_tokens", cached: "cached_read_text_tokens" },
};

function applyModalityCounts(target: UsageShape, items: ModalityTokenCount[] | undefined, kind: "input" | "output") {
    if (!Array.isArray(items)) return;
    for (const entry of items) {
        const meter = modalityToMeter[entry.modality ?? "TEXT"];
        const key = meter?.[kind];
        if (!key) continue;
        target[key] = (target[key] ?? 0) + (entry.tokenCount ?? 0);
    }
}

function applyCachedModalityCounts(target: UsageShape, items: ModalityTokenCount[] | undefined) {
    if (!Array.isArray(items)) return;
    for (const entry of items) {
        const meter = modalityToMeter[entry.modality ?? "TEXT"];
        const key = meter?.cached;
        if (!key) continue;
        target[key] = (target[key] ?? 0) + (entry.tokenCount ?? 0);
    }
}

/**
 * Build a normalized usage map from Google usageMetadata.
 * Maps modalities to our meters and fills totals/reasoning.
 */
export function normalizeGoogleUsage(meta: UsageMetadata | undefined): UsageShape | undefined {
    if (!meta) return undefined;
    const usage: UsageShape = {};

    // Aggregate details by modality first.
    applyModalityCounts(usage, meta.promptTokensDetails, "input");
    applyCachedModalityCounts(usage, meta.cacheTokensDetails);
    applyModalityCounts(usage, meta.toolUsePromptTokensDetails, "input");
    applyModalityCounts(usage, meta.candidatesTokensDetails, "output");

    // Fallback to coarse counts if detailed modalities absent.
    if (meta.promptTokenCount != null) usage.input_text_tokens = usage.input_text_tokens ?? Math.max(0, meta.promptTokenCount
        - (usage.input_image_tokens ?? 0) - (usage.input_audio_tokens ?? 0) - (usage.input_video_tokens ?? 0));
    if (meta.toolUsePromptTokenCount != null && !meta.toolUsePromptTokensDetails?.length) usage.input_text_tokens = (usage.input_text_tokens ?? 0) + meta.toolUsePromptTokenCount;
    if (meta.cachedContentTokenCount != null) usage.cached_read_text_tokens = usage.cached_read_text_tokens ?? Math.max(0, meta.cachedContentTokenCount
        - (usage.cached_read_image_tokens ?? 0) - (usage.cached_read_audio_tokens ?? 0) - (usage.cached_read_video_tokens ?? 0));
    if (typeof usage.cached_read_text_tokens === "number" && usage.cached_read_text_tokens > 0) {
        (usage as Record<string, any>).cached_read_tokens_are_subset_of_input = true;
    }

    if (meta.candidatesTokenCount != null) usage.output_text_tokens = usage.output_text_tokens ?? Math.max(0, meta.candidatesTokenCount
        - (usage.output_image_tokens ?? 0) - (usage.output_audio_tokens ?? 0) - (usage.output_video_tokens ?? 0));
    // Thoughts are not part of candidatesTokenCount, and Google bills them at the output text price.
    const thoughts = pickFiniteNumber(meta.thoughtsTokenCount) ?? pickFiniteNumber(meta.thoughtTokenCount);
    if (thoughts != null) {
        usage.reasoning_tokens = thoughts;
        usage.output_text_tokens = (usage.output_text_tokens ?? 0) + thoughts;
    }

    if (meta.totalTokenCount != null) usage.total_tokens = meta.totalTokenCount;

    return Object.keys(usage).length ? usage : undefined;
}

function pickFiniteNumber(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sumDefined(values: Array<number | undefined>): number | undefined {
    let total = 0;
    let seen = false;
    for (const value of values) {
        if (typeof value !== "number" || !Number.isFinite(value)) continue;
        total += value;
        seen = true;
    }
    return seen ? total : undefined;
}

function sumModalityCounts(items: ModalityTokenCount[] | undefined): number | undefined {
    if (!Array.isArray(items)) return undefined;
    return sumDefined(items.map((entry) => pickFiniteNumber(entry?.tokenCount)));
}

/**
 * Convert Google usageMetadata into canonical IR usage, including multimodal token details.
 */
export function googleUsageMetadataToIRUsage(meta: UsageMetadata | undefined, headerServiceTier?: string): IRUsage | undefined {
    if (!meta) return undefined;
    const normalized = normalizeGoogleUsage(meta) ?? {};

    // Google bills totalTokenCount = promptTokenCount + toolUsePromptTokenCount
    // + candidatesTokenCount + thoughtsTokenCount. Tool-use prompt tokens are input,
    // and thoughts are output at the output price, so both belong in the canonical
    // totals (as OpenAI's prompt_tokens and completion_tokens include theirs).
    const promptTokens =
        pickFiniteNumber(meta.promptTokenCount) ??
        sumModalityCounts(meta.promptTokensDetails);
    const toolUsePromptTokens =
        pickFiniteNumber(meta.toolUsePromptTokenCount) ??
        sumModalityCounts(meta.toolUsePromptTokensDetails);
    const inputTokens = sumDefined([promptTokens, toolUsePromptTokens]) ?? 0;
    const reasoningTokens =
        pickFiniteNumber(meta.thoughtsTokenCount) ??
        pickFiniteNumber(meta.thoughtTokenCount);
    const candidatesTokens =
        pickFiniteNumber(meta.candidatesTokenCount) ??
        sumModalityCounts(meta.candidatesTokensDetails);
    const outputTokens = sumDefined([candidatesTokens, reasoningTokens]) ?? 0;
    const totalTokens = pickFiniteNumber(meta.totalTokenCount) ?? (inputTokens + outputTokens);

    const cachedInputTokens =
        pickFiniteNumber(meta.cachedContentTokenCount) ??
        pickFiniteNumber(normalized.cached_read_text_tokens);

    const ext: IRUsage["_ext"] = {};
    // Media prompt tokens net of cached media (cacheTokensDetails): promptTokenCount includes
    // cached content, and the cached part is billed through cachedInputTokens, so pricing the
    // full modality count on its own meter would bill cached media twice.
    const uncachedModality = (input: number | undefined, cached: number | undefined) =>
        pickFiniteNumber(input) == null ? undefined : Math.max(0, (input as number) - (pickFiniteNumber(cached) ?? 0));
    const inputImage = uncachedModality(normalized.input_image_tokens, normalized.cached_read_image_tokens);
    const inputAudio = uncachedModality(normalized.input_audio_tokens, normalized.cached_read_audio_tokens);
    const inputVideo = uncachedModality(normalized.input_video_tokens, normalized.cached_read_video_tokens);
    if (inputImage != null) ext.inputImageTokens = inputImage;
    if (inputAudio != null) ext.inputAudioTokens = inputAudio;
    if (inputVideo != null) ext.inputVideoTokens = inputVideo;
    if (pickFiniteNumber(normalized.output_image_tokens) != null) ext.outputImageTokens = normalized.output_image_tokens;
    if (pickFiniteNumber(normalized.output_audio_tokens) != null) ext.outputAudioTokens = normalized.output_audio_tokens;
    if (pickFiniteNumber(normalized.output_video_tokens) != null) ext.outputVideoTokens = normalized.output_video_tokens;
    if (pickFiniteNumber(normalized.cached_write_text_tokens) != null) ext.cachedWriteTokens = normalized.cached_write_text_tokens;

    const irUsage: IRUsage = {
        inputTokens,
        outputTokens,
        totalTokens,
    };
    const observedTier = normalizeGoogleServiceTier(meta.serviceTier ?? meta.service_tier)
        ?? normalizeGoogleServiceTier(meta.trafficType)
        ?? normalizeGoogleServiceTier(headerServiceTier);
    if (observedTier) irUsage.serviceTier = observedTier;

    if (cachedInputTokens != null) {
        irUsage.cachedInputTokens = cachedInputTokens;
        irUsage.cachedReadTokensAreSubsetOfInput = true;
    }
    if (reasoningTokens != null) irUsage.reasoningTokens = reasoningTokens;
    if (Object.keys(ext).length > 0) irUsage._ext = ext;

    return irUsage;
}
