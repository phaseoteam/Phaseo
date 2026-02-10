// Purpose: Execute-stage parameter normalization.
// Why: Applies generic protocol constraints before execution.
// How: Adjusts IR params that are not provider-specific.

import type { IRChatRequest } from "@core/ir";
import type { Protocol } from "@protocols/detect";

const DEFAULT_ANTHROPIC_MAX_TOKENS = 4096;
const REASONING_EFFORT_ORDER = ["none", "minimal", "low", "medium", "high", "xhigh"] as const;
type ReasoningEffort = (typeof REASONING_EFFORT_ORDER)[number];
type ParamRange = {
    min?: number;
    max?: number;
    defaultValue?: number;
};

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function protocolTemperatureMax(protocol?: Protocol): number {
    return protocol === "anthropic.messages" ? 1 : 2;
}

function providerTemperatureMax(providerId: string): number {
    return providerId === "anthropic" ? 1 : 2;
}

function isReasoningEffort(value: unknown): value is ReasoningEffort {
    return typeof value === "string" && REASONING_EFFORT_ORDER.includes(value as ReasoningEffort);
}

function toFiniteNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim().length > 0) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
}

function toStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    }
    if (typeof value === "string" && value.trim().length > 0) {
        return value
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean);
    }
    return [];
}

function readParamConfig(
    capabilityParams: Record<string, any> | null | undefined,
    keys: string[],
): Record<string, any> | undefined {
    if (!capabilityParams || typeof capabilityParams !== "object") return undefined;
    for (const key of keys) {
        const value = capabilityParams[key];
        if (value && typeof value === "object" && !Array.isArray(value)) {
            return value as Record<string, any>;
        }
    }
    return undefined;
}

function extractRangeFromConfig(config: Record<string, any> | undefined): ParamRange {
    if (!config) return {};
    const min = toFiniteNumber(config.provider_min ?? config.min ?? config.minimum);
    const max = toFiniteNumber(config.provider_max ?? config.max ?? config.maximum);
    const defaultValue = toFiniteNumber(config.provider_default ?? config.default);
    return { min, max, defaultValue };
}

function mergeRanges(base: ParamRange, override: ParamRange): ParamRange {
    return {
        min: override.min ?? base.min,
        max: override.max ?? base.max,
        defaultValue: override.defaultValue ?? base.defaultValue,
    };
}

function rangeForParam(args: {
    capabilityParams?: Record<string, any> | null;
    providerId: string;
    protocol?: Protocol;
    keys: string[];
    fallback: ParamRange;
}): ParamRange {
    const config = readParamConfig(args.capabilityParams, args.keys);
    return mergeRanges(args.fallback, extractRangeFromConfig(config));
}

function clampByRange(value: number, range: ParamRange): number {
    const min = range.min ?? Number.NEGATIVE_INFINITY;
    const max = range.max ?? Number.POSITIVE_INFINITY;
    if (!Number.isFinite(min) && !Number.isFinite(max)) return value;
    if (!Number.isFinite(min)) return Math.min(value, max);
    if (!Number.isFinite(max)) return Math.max(value, min);
    return clamp(value, min, max);
}

function fallbackReasoningEfforts(providerId: string, model: string): ReasoningEffort[] {
    const provider = providerId.toLowerCase();
    const m = model.toLowerCase();

    if (provider === "anthropic") {
        return ["low", "medium", "high", "xhigh"];
    }

    if (provider === "openai" || provider === "azure") {
        if (m.includes("gpt-5.1-codex-max")) return ["none", "minimal", "low", "medium", "high", "xhigh"];
        if (m.includes("gpt-5.2") || m.includes("gpt-5.3")) return ["none", "minimal", "low", "medium", "high", "xhigh"];
        if (m.includes("gpt-5.1")) return ["none", "minimal", "low", "medium", "high"];
        if (m.includes("gpt-5")) return ["minimal", "low", "medium", "high"];
    }

    return [...REASONING_EFFORT_ORDER];
}

function getReasoningEffortAllowlist(
    capabilityParams: Record<string, any> | null | undefined,
    providerId: string,
    model: string,
): ReasoningEffort[] {
    const direct = readParamConfig(capabilityParams, [
        "reasoning.effort",
        "reasoning_effort",
    ]);
    const nested = readParamConfig(capabilityParams, ["reasoning"])?.effort;
    const nestedConfig = nested && typeof nested === "object" && !Array.isArray(nested)
        ? nested as Record<string, any>
        : undefined;
    const fromConfig = [
        ...toStringArray(direct?.supported_values ?? direct?.allowed_values ?? direct?.enum ?? direct?.values),
        ...toStringArray(
            nestedConfig?.supported_values ??
            nestedConfig?.allowed_values ??
            nestedConfig?.enum ??
            nestedConfig?.values,
        ),
    ]
        .map((item) => item.toLowerCase())
        .filter(isReasoningEffort);

    if (fromConfig.length > 0) return Array.from(new Set(fromConfig));
    return fallbackReasoningEfforts(providerId, model);
}

function clampReasoningEffort(effort: ReasoningEffort, supported: ReasoningEffort[]): ReasoningEffort {
    if (!supported.length) return effort;
    if (supported.includes(effort)) return effort;
    const requestedIndex = REASONING_EFFORT_ORDER.indexOf(effort);
    if (requestedIndex < 0) return supported[0];
    let best = supported[0];
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const value of supported) {
        const idx = REASONING_EFFORT_ORDER.indexOf(value);
        if (idx < 0) continue;
        const diff = Math.abs(idx - requestedIndex);
        if (diff < bestDiff) {
            best = value;
            bestDiff = diff;
        }
    }
    return best;
}

function normalizeTemperature(
    temperature: number,
    protocolMax: number,
    providerMax: number
): number {
    const max = Math.min(protocolMax, providerMax);
    return clamp(temperature, 0, max);
}

function normalizeMaxTokens(
    ir: IRChatRequest,
    providerId: string,
    capabilityParams?: Record<string, any> | null,
    providerMaxOutputTokens?: number | null,
): number | undefined {
    const range = rangeForParam({
        capabilityParams,
        providerId,
        protocol: undefined,
        keys: ["max_tokens", "max_output_tokens"],
        fallback: { min: 1 },
    });
    if (typeof providerMaxOutputTokens === "number" && Number.isFinite(providerMaxOutputTokens)) {
        range.max = Math.min(range.max ?? Number.POSITIVE_INFINITY, providerMaxOutputTokens);
    }

    if (typeof ir.maxTokens === "number" && Number.isFinite(ir.maxTokens)) {
        return clampByRange(ir.maxTokens, range);
    }

    if (providerId === "anthropic") {
        // Anthropic requires max_tokens; keep a safe default when omitted.
        const fallback = range.defaultValue ?? DEFAULT_ANTHROPIC_MAX_TOKENS;
        return clampByRange(fallback, range);
    }
    return undefined;
}

export function normalizeIRForProvider(
    ir: IRChatRequest,
    providerId: string,
    protocol?: Protocol,
    options?: {
        capabilityParams?: Record<string, any> | null;
        providerMaxOutputTokens?: number | null;
        modelForReasoning?: string | null;
    }
): IRChatRequest {
    const capabilityParams = options?.capabilityParams ?? null;
    const modelForReasoning = options?.modelForReasoning ?? ir.model;
    const nextMaxTokens = normalizeMaxTokens(
        ir,
        providerId,
        capabilityParams,
        options?.providerMaxOutputTokens ?? null,
    );

    let nextTemperature: number | undefined = undefined;
    if (typeof ir.temperature === "number" && Number.isFinite(ir.temperature)) {
        const pMax = protocolTemperatureMax(protocol);
        const providerMax = providerTemperatureMax(providerId);
        const range = rangeForParam({
            capabilityParams,
            providerId,
            protocol,
            keys: ["temperature"],
            fallback: { min: 0, max: Math.min(pMax, providerMax) },
        });
        nextTemperature =
            pMax === providerMax
                ? clampByRange(ir.temperature, range)
                : clampByRange(normalizeTemperature(ir.temperature, pMax, providerMax), range);
    }

    let nextTopP: number | undefined = undefined;
    if (typeof ir.topP === "number" && Number.isFinite(ir.topP)) {
        const range = rangeForParam({
            capabilityParams,
            providerId,
            protocol,
            keys: ["top_p"],
            fallback: { min: 0, max: 1 },
        });
        nextTopP = clampByRange(ir.topP, range);
    }

    let nextFrequencyPenalty: number | undefined = undefined;
    if (typeof ir.frequencyPenalty === "number" && Number.isFinite(ir.frequencyPenalty)) {
        const range = rangeForParam({
            capabilityParams,
            providerId,
            protocol,
            keys: ["frequency_penalty"],
            fallback: { min: -2, max: 2 },
        });
        nextFrequencyPenalty = clampByRange(ir.frequencyPenalty, range);
    }

    let nextPresencePenalty: number | undefined = undefined;
    if (typeof ir.presencePenalty === "number" && Number.isFinite(ir.presencePenalty)) {
        const range = rangeForParam({
            capabilityParams,
            providerId,
            protocol,
            keys: ["presence_penalty"],
            fallback: { min: -2, max: 2 },
        });
        nextPresencePenalty = clampByRange(ir.presencePenalty, range);
    }

    let nextTopLogprobs: number | undefined = undefined;
    if (typeof ir.topLogprobs === "number" && Number.isFinite(ir.topLogprobs)) {
        const range = rangeForParam({
            capabilityParams,
            providerId,
            protocol,
            keys: ["top_logprobs"],
            fallback: { min: 0, max: 20 },
        });
        nextTopLogprobs = clampByRange(ir.topLogprobs, range);
    }

    let nextReasoning = ir.reasoning;
    if (ir.reasoning) {
        const reasoning = { ...ir.reasoning };

        if (providerId === "openai" && reasoning.summary == null) {
            // Keep OpenAI responses stable when callers omit summary.
            reasoning.summary = "auto";
        }

        if (isReasoningEffort(reasoning.effort)) {
            const supported = getReasoningEffortAllowlist(
                capabilityParams,
                providerId,
                modelForReasoning ?? ir.model,
            );
            reasoning.effort = clampReasoningEffort(reasoning.effort, supported);
        }

        if (typeof reasoning.maxTokens === "number" && Number.isFinite(reasoning.maxTokens)) {
            const range = rangeForParam({
                capabilityParams,
                providerId,
                protocol,
                keys: ["reasoning.max_tokens", "reasoning.maxTokens"],
                fallback: { min: 0 },
            });
            reasoning.maxTokens = clampByRange(reasoning.maxTokens, range);
        }

        nextReasoning = reasoning;
    }

    const needsMaxTokens = nextMaxTokens !== undefined && nextMaxTokens !== ir.maxTokens;
    const needsTemp =
        nextTemperature !== undefined &&
        (ir.temperature === undefined || Math.abs(nextTemperature - ir.temperature) > 1e-9);
    const needsTopP =
        nextTopP !== undefined &&
        (ir.topP === undefined || Math.abs(nextTopP - ir.topP) > 1e-9);
    const needsFrequencyPenalty =
        nextFrequencyPenalty !== undefined &&
        (ir.frequencyPenalty === undefined || Math.abs(nextFrequencyPenalty - ir.frequencyPenalty) > 1e-9);
    const needsPresencePenalty =
        nextPresencePenalty !== undefined &&
        (ir.presencePenalty === undefined || Math.abs(nextPresencePenalty - ir.presencePenalty) > 1e-9);
    const needsTopLogprobs =
        nextTopLogprobs !== undefined &&
        (ir.topLogprobs === undefined || Math.abs(nextTopLogprobs - ir.topLogprobs) > 1e-9);
    const needsReasoning = JSON.stringify(nextReasoning ?? null) !== JSON.stringify(ir.reasoning ?? null);

    if (
        !needsMaxTokens &&
        !needsTemp &&
        !needsTopP &&
        !needsFrequencyPenalty &&
        !needsPresencePenalty &&
        !needsTopLogprobs &&
        !needsReasoning
    ) {
        return ir;
    }

    const next: IRChatRequest = { ...ir };
    if (needsMaxTokens) next.maxTokens = nextMaxTokens;
    if (needsTemp) next.temperature = nextTemperature;
    if (needsTopP) next.topP = nextTopP;
    if (needsFrequencyPenalty) next.frequencyPenalty = nextFrequencyPenalty;
    if (needsPresencePenalty) next.presencePenalty = nextPresencePenalty;
    if (needsTopLogprobs) next.topLogprobs = nextTopLogprobs;
    if (needsReasoning) next.reasoning = nextReasoning;
    return next;
}
