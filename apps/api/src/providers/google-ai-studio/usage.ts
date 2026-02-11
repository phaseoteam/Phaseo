// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import type { IRUsage } from "@core/ir";

type ModalityTokenCount = {
    modality?: string;
    tokenCount?: number;
};

type UsageMetadata = {
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

const modalityToMeter: Record<string, { input: string; output: string }> = {
    MODALITY_UNSPECIFIED: { input: "input_text_tokens", output: "output_text_tokens" },
    TEXT: { input: "input_text_tokens", output: "output_text_tokens" },
    IMAGE: { input: "input_image_tokens", output: "output_image_tokens" },
    VIDEO: { input: "input_video_tokens", output: "output_video_tokens" },
    AUDIO: { input: "input_audio_tokens", output: "output_audio_tokens" },
    DOCUMENT: { input: "input_text_tokens", output: "output_text_tokens" },
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

/**
 * Build a normalized usage map from Google usageMetadata.
 * Maps modalities to our meters and fills totals/reasoning.
 */
export function normalizeGoogleUsage(meta: UsageMetadata | undefined): UsageShape | undefined {
    if (!meta) return undefined;
    const usage: UsageShape = {};

    // Aggregate details by modality first.
    applyModalityCounts(usage, meta.promptTokensDetails, "input");
    applyModalityCounts(usage, meta.cacheTokensDetails, "input");
    applyModalityCounts(usage, meta.toolUsePromptTokensDetails, "input");
    applyModalityCounts(usage, meta.candidatesTokensDetails, "output");

    // Fallback to coarse counts if detailed modalities absent.
    if (meta.promptTokenCount != null) usage.input_text_tokens = usage.input_text_tokens ?? meta.promptTokenCount;
    if (meta.toolUsePromptTokenCount != null) usage.input_text_tokens = (usage.input_text_tokens ?? 0) + meta.toolUsePromptTokenCount;
    if (meta.cachedContentTokenCount != null) usage.cached_read_text_tokens = meta.cachedContentTokenCount;

    if (meta.candidatesTokenCount != null) usage.output_text_tokens = usage.output_text_tokens ?? meta.candidatesTokenCount;
    if (meta.thoughtsTokenCount != null) usage.reasoning_tokens = meta.thoughtsTokenCount;

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

/**
 * Convert Google usageMetadata into canonical IR usage, including multimodal token details.
 */
export function googleUsageMetadataToIRUsage(meta: UsageMetadata | undefined): IRUsage | undefined {
    if (!meta) return undefined;
    const normalized = normalizeGoogleUsage(meta) ?? {};

    const inputTokens =
        pickFiniteNumber(meta.promptTokenCount) ??
        sumDefined([
            normalized.input_text_tokens,
            normalized.input_image_tokens,
            normalized.input_audio_tokens,
            normalized.input_video_tokens,
        ]) ??
        0;
    const outputTokens =
        pickFiniteNumber(meta.candidatesTokenCount) ??
        sumDefined([
            normalized.output_text_tokens,
            normalized.output_image_tokens,
            normalized.output_audio_tokens,
            normalized.output_video_tokens,
        ]) ??
        0;
    const totalTokens = pickFiniteNumber(meta.totalTokenCount) ?? (inputTokens + outputTokens);

    const cachedInputTokens =
        pickFiniteNumber(meta.cachedContentTokenCount) ??
        pickFiniteNumber(normalized.cached_read_text_tokens);
    const reasoningTokens =
        pickFiniteNumber(meta.thoughtsTokenCount) ??
        pickFiniteNumber(meta.thoughtTokenCount) ??
        pickFiniteNumber(normalized.reasoning_tokens);

    const ext: IRUsage["_ext"] = {};
    if (pickFiniteNumber(normalized.input_image_tokens) != null) ext.inputImageTokens = normalized.input_image_tokens;
    if (pickFiniteNumber(normalized.input_audio_tokens) != null) ext.inputAudioTokens = normalized.input_audio_tokens;
    if (pickFiniteNumber(normalized.input_video_tokens) != null) ext.inputVideoTokens = normalized.input_video_tokens;
    if (pickFiniteNumber(normalized.output_image_tokens) != null) ext.outputImageTokens = normalized.output_image_tokens;
    if (pickFiniteNumber(normalized.output_audio_tokens) != null) ext.outputAudioTokens = normalized.output_audio_tokens;
    if (pickFiniteNumber(normalized.output_video_tokens) != null) ext.outputVideoTokens = normalized.output_video_tokens;
    if (pickFiniteNumber(normalized.cached_write_text_tokens) != null) ext.cachedWriteTokens = normalized.cached_write_text_tokens;

    const irUsage: IRUsage = {
        inputTokens,
        outputTokens,
        totalTokens,
    };

    if (cachedInputTokens != null) irUsage.cachedInputTokens = cachedInputTokens;
    if (reasoningTokens != null) irUsage.reasoningTokens = reasoningTokens;
    if (Object.keys(ext).length > 0) irUsage._ext = ext;

    return irUsage;
}

