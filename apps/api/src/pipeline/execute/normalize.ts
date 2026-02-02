// Purpose: Execute-stage parameter normalization.
// Why: Keeps provider/protocol quirks out of executors.
// How: Adjusts IR params per provider before the executor call.

import type { IRChatRequest } from "@core/ir";
import type { Protocol } from "@protocols/detect";
import type { ProviderCandidate } from "@pipeline/before/types";
import { normalizeReasoningForProvider } from "@pipeline/before/reasoningNormalization";

const DEFAULT_ANTHROPIC_MAX_TOKENS = 4096;

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function protocolTemperatureMax(protocol?: Protocol): number {
    return protocol === "anthropic.messages" ? 1 : 2;
}

function providerTemperatureMax(providerId: string): number {
    return providerId === "anthropic" ? 1 : 2;
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
    providerId: string
): number | undefined {
    if (typeof ir.maxTokens === "number" && Number.isFinite(ir.maxTokens)) {
        return ir.maxTokens;
    }
    if (providerId === "anthropic") {
        // Anthropic requires max_tokens; keep a safe default when omitted.
        return DEFAULT_ANTHROPIC_MAX_TOKENS;
    }
    return undefined;
}

export function normalizeIRForProvider(
    ir: IRChatRequest,
    providerId: string,
    protocol?: Protocol,
    candidate?: ProviderCandidate
): IRChatRequest {
    const nextMaxTokens = normalizeMaxTokens(ir, providerId);

    let nextTemperature: number | undefined = undefined;
    if (typeof ir.temperature === "number" && Number.isFinite(ir.temperature)) {
        const pMax = protocolTemperatureMax(protocol);
        const providerMax = providerTemperatureMax(providerId);
        nextTemperature =
            pMax === providerMax
                ? clamp(ir.temperature, 0, providerMax)
                : normalizeTemperature(ir.temperature, pMax, providerMax);
    }

    // Normalize reasoning parameters based on provider capabilities
    let nextReasoning = ir.reasoning;
    if (candidate && ir.reasoning) {
        nextReasoning = normalizeReasoningForProvider(ir.reasoning, candidate);
    }

    const needsMaxTokens = nextMaxTokens !== undefined && nextMaxTokens !== ir.maxTokens;
    const needsTemp =
        nextTemperature !== undefined &&
        (ir.temperature === undefined || Math.abs(nextTemperature - ir.temperature) > 1e-9);
    const needsReasoning = nextReasoning !== ir.reasoning;

    if (!needsMaxTokens && !needsTemp && !needsReasoning) {
        return ir;
    }

    const next: IRChatRequest = { ...ir };
    if (needsMaxTokens) next.maxTokens = nextMaxTokens;
    if (needsTemp) next.temperature = nextTemperature;
    if (needsReasoning) next.reasoning = nextReasoning;
    return next;
}
