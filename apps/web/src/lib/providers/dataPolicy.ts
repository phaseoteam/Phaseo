import type { ProviderPromptTrainingPolicy } from "@/lib/providers/promptTrainingPolicy";
import type { ZeroDataRetentionMode } from "@/lib/providers/providerResidency";

export const PROVIDER_DATA_POLICY_TIER_VALUES = [
	"unknown",
	"private",
	"logs",
	"trains",
] as const;

export type ProviderDataPolicyTier =
	(typeof PROVIDER_DATA_POLICY_TIER_VALUES)[number];

export const PROVIDER_DATA_POLICY_CONFIDENCE_VALUES = [
	"unknown",
	"low",
	"maybe",
	"confirmed",
] as const;

export type ProviderDataPolicyConfidence =
	(typeof PROVIDER_DATA_POLICY_CONFIDENCE_VALUES)[number];

export const PROVIDER_DATA_POLICY_CONTRACT_MODE_VALUES = [
	"none",
	"public_terms",
	"standard_dpa",
	"enterprise_contract",
	"custom_contract",
] as const;

export type ProviderDataPolicyContractMode =
	(typeof PROVIDER_DATA_POLICY_CONTRACT_MODE_VALUES)[number];

export const PROVIDER_DATA_POLICY_TIER_LABELS: Record<
	ProviderDataPolicyTier,
	string
> = {
	unknown: "Unknown",
	private: "Private",
	logs: "May retain logs",
	trains: "May train",
};

export const PROVIDER_DATA_POLICY_CONFIDENCE_LABELS: Record<
	ProviderDataPolicyConfidence,
	string
> = {
	unknown: "Unknown",
	low: "Low",
	maybe: "Best-known",
	confirmed: "Confirmed",
};

export const PROVIDER_DATA_POLICY_CONTRACT_MODE_LABELS: Record<
	ProviderDataPolicyContractMode,
	string
> = {
	none: "No separate agreement",
	public_terms: "Public terms",
	standard_dpa: "Standard DPA",
	enterprise_contract: "Enterprise agreement",
	custom_contract: "Custom agreement",
};

function normalizeEnum<T extends readonly string[]>(
	value: unknown,
	values: T,
	fallback: T[number],
): T[number] {
	if (typeof value !== "string") return fallback;
	const normalized = value.trim().toLowerCase();
	return values.includes(normalized) ? normalized : fallback;
}

function inferTier(args: {
	promptTrainingPolicy?: ProviderPromptTrainingPolicy | string | null;
	zeroDataRetention?: ZeroDataRetentionMode | null;
}): ProviderDataPolicyTier {
	if (args.zeroDataRetention === "default") return "private";

	switch (args.promptTrainingPolicy) {
		case "may_train":
		case "opt_out_available":
			return "trains";
		default:
			return "unknown";
	}
}

export function resolveProviderDataPolicy(args: {
	tier?: ProviderDataPolicyTier | string | null;
	confidence?: ProviderDataPolicyConfidence | string | null;
	contractMode?: ProviderDataPolicyContractMode | string | null;
	promptTrainingPolicy?: ProviderPromptTrainingPolicy | string | null;
	zeroDataRetention?: ZeroDataRetentionMode | null;
}): {
	tier: ProviderDataPolicyTier;
	confidence: ProviderDataPolicyConfidence;
	contractMode: ProviderDataPolicyContractMode;
} {
	const explicitTier = normalizeEnum(
		args.tier,
		PROVIDER_DATA_POLICY_TIER_VALUES,
		"unknown",
	);
	const tier =
		explicitTier === "unknown"
			? inferTier({
					promptTrainingPolicy: args.promptTrainingPolicy,
					zeroDataRetention: args.zeroDataRetention,
				})
			: explicitTier;
	const confidence = normalizeEnum(
		args.confidence,
		PROVIDER_DATA_POLICY_CONFIDENCE_VALUES,
		tier === "unknown" ? "unknown" : "maybe",
	);

	return {
		tier,
		confidence,
		contractMode: normalizeEnum(
			args.contractMode,
			PROVIDER_DATA_POLICY_CONTRACT_MODE_VALUES,
			"none",
		),
	};
}
