// Purpose: Execute-stage parameter normalization.
// Why: Applies generic protocol constraints before execution.
// How: Adjusts IR params that are not provider-specific.

import type { IRChatRequest } from "@core/ir";
import type { Protocol } from "@protocols/detect";

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
    protocol?: Protocol
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

    const needsMaxTokens = nextMaxTokens !== undefined && nextMaxTokens !== ir.maxTokens;
    const needsTemp =
        nextTemperature !== undefined &&
        (ir.temperature === undefined || Math.abs(nextTemperature - ir.temperature) > 1e-9);

    if (!needsMaxTokens && !needsTemp) {
        return ir;
    }

    const next: IRChatRequest = { ...ir };
    if (needsMaxTokens) next.maxTokens = nextMaxTokens;
    if (needsTemp) next.temperature = nextTemperature;
    return next;
}
