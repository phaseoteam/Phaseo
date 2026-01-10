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
