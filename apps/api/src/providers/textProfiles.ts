// Purpose: Text-oriented view over provider profiles.
// Why: Keeps text policy call-sites stable while provider metadata is centralized.
// How: Reads from @providers/providerProfiles and exposes text-specific helpers.

import {
	getProviderProfile,
	type TextReasoningEffort,
} from "./providerProfiles";

type TextProviderProfile = {
	id: string;
	paramPolicy?: {
		supportedParams?: string[];
		unsupportedParams?: string[];
	};
	normalize?: {
		maxTemperature?: number;
		defaultMaxTokensWhenMissing?: number;
		serviceTierAliases?: Record<string, string>;
		reasoningEffortFallback?:
			| TextReasoningEffort[]
			| ((model: string) => TextReasoningEffort[]);
	};
};

function matchesPolicyPath(policyPath: string, candidates: string[]): boolean {
	return candidates.some((candidate) =>
		candidate === policyPath ||
		candidate.startsWith(`${policyPath}.`) ||
		policyPath.startsWith(`${candidate}.`)
	);
}

export function getTextProviderProfile(providerId: string): TextProviderProfile | null {
	const profile = getProviderProfile(providerId);
	if (!profile?.text) return null;
	return {
		id: profile.id,
		paramPolicy: profile.text.paramPolicy,
		normalize: profile.text.normalize,
	};
}

export function resolveTextProviderParamPolicyOverride(args: {
	providerId: string;
	paramPathCandidates: string[];
}): boolean | undefined {
	const profile = getTextProviderProfile(args.providerId);
	const policy = profile?.paramPolicy;
	if (!policy) return undefined;

	for (const path of policy.unsupportedParams ?? []) {
		if (matchesPolicyPath(path, args.paramPathCandidates)) return false;
	}
	for (const path of policy.supportedParams ?? []) {
		if (matchesPolicyPath(path, args.paramPathCandidates)) return true;
	}
	return undefined;
}

export function getTextProviderTemperatureMax(providerId: string): number | undefined {
	return getTextProviderProfile(providerId)?.normalize?.maxTemperature;
}

export function getTextProviderDefaultMaxTokens(
	providerId: string,
): number | undefined {
	return getTextProviderProfile(providerId)?.normalize?.defaultMaxTokensWhenMissing;
}

export function getTextProviderReasoningEffortFallback(args: {
	providerId: string;
	model: string;
}): TextReasoningEffort[] | undefined {
	const fallback = getTextProviderProfile(args.providerId)?.normalize
		?.reasoningEffortFallback;
	if (!fallback) return undefined;
	if (typeof fallback === "function") {
		return fallback(args.model);
	}
	return fallback;
}

export function normalizeTextProviderServiceTier(
	providerId: string,
	value: unknown,
): string | undefined {
	if (typeof value !== "string" || value.length === 0) return undefined;
	const normalized = value.toLowerCase();
	const alias = getTextProviderProfile(providerId)?.normalize?.serviceTierAliases?.[
		normalized
	];
	return alias ?? value;
}
