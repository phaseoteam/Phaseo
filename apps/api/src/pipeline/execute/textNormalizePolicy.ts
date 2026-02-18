// Purpose: Code-first provider normalization policy for text execution.
// Why: Keeps provider quirks for clamping/defaulting centralized and easy to extend.
// How: Exposes helper lookups used by execute-stage IR normalization.

import type { Protocol } from "@protocols/detect";
import {
	getTextProviderDefaultMaxTokens,
	getTextProviderReasoningEffortFallback,
	getTextProviderTemperatureMax,
} from "@providers/textProfiles";

export const DEFAULT_ANTHROPIC_MAX_TOKENS =
	getTextProviderDefaultMaxTokens("anthropic") ?? 4096;

export const REASONING_EFFORT_ORDER = [
	"none",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
] as const;

export type ReasoningEffort = (typeof REASONING_EFFORT_ORDER)[number];

export function isReasoningEffort(value: unknown): value is ReasoningEffort {
	return (
		typeof value === "string" &&
		REASONING_EFFORT_ORDER.includes(value as ReasoningEffort)
	);
}

export function protocolTemperatureMax(protocol?: Protocol): number {
	return protocol === "anthropic.messages" ? 1 : 2;
}

export function providerTemperatureMax(providerId: string): number {
	return getTextProviderTemperatureMax(providerId) ?? 2;
}

export function fallbackReasoningEfforts(
	providerId: string,
	model: string,
): ReasoningEffort[] {
	return (
		getTextProviderReasoningEffortFallback({ providerId, model }) ?? [
			...REASONING_EFFORT_ORDER,
		]
	);
}
