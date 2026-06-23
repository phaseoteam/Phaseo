import type { ZeroDataRetentionMode } from "@/lib/providers/providerResidency";
import { normalizeProviderPromptTrainingPolicy } from "@/lib/providers/promptTrainingPolicy";

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
	"confirmed",
	"maybe",
] as const;

export type ProviderDataPolicyConfidence =
	(typeof PROVIDER_DATA_POLICY_CONFIDENCE_VALUES)[number];

export const PROVIDER_DATA_POLICY_CONTRACT_MODE_VALUES = [
	"none",
	"customer_agreement",
	"enterprise_agreement",
] as const;

export type ProviderDataPolicyContractMode =
	(typeof PROVIDER_DATA_POLICY_CONTRACT_MODE_VALUES)[number];

export const PROVIDER_DATA_POLICY_TIER_LABELS: Record<
	ProviderDataPolicyTier,
	string
> = {
	unknown: "Unknown",
	private: "Private",
	logs: "Logs",
	trains: "Trains",
};

export const PROVIDER_DATA_POLICY_CONFIDENCE_LABELS: Record<
	ProviderDataPolicyConfidence,
	string
> = {
	unknown: "Unknown",
	confirmed: "Confirmed",
	maybe: "Maybe",
};

export const PROVIDER_DATA_POLICY_CONTRACT_MODE_LABELS: Record<
	ProviderDataPolicyContractMode,
	string
> = {
	none: "No agreement noted",
	customer_agreement: "Customer agreement on file",
	enterprise_agreement: "Enterprise agreement on file",
};

export function normalizeProviderDataPolicyTier(
	value: unknown,
): ProviderDataPolicyTier {
	if (typeof value !== "string") return "unknown";
	const normalized = value.trim().toLowerCase();
	if (
		PROVIDER_DATA_POLICY_TIER_VALUES.includes(
			normalized as ProviderDataPolicyTier,
		)
	) {
		return normalized as ProviderDataPolicyTier;
	}
	return "unknown";
}

export function normalizeProviderDataPolicyConfidence(
	value: unknown,
): ProviderDataPolicyConfidence {
	if (typeof value !== "string") return "unknown";
	const normalized = value.trim().toLowerCase();
	if (
		PROVIDER_DATA_POLICY_CONFIDENCE_VALUES.includes(
			normalized as ProviderDataPolicyConfidence,
		)
	) {
		return normalized as ProviderDataPolicyConfidence;
	}
	return "unknown";
}

export function normalizeProviderDataPolicyContractMode(
	value: unknown,
): ProviderDataPolicyContractMode {
	if (typeof value !== "string") return "none";
	const normalized = value.trim().toLowerCase();
	if (
		PROVIDER_DATA_POLICY_CONTRACT_MODE_VALUES.includes(
			normalized as ProviderDataPolicyContractMode,
		)
	) {
		return normalized as ProviderDataPolicyContractMode;
	}
	return "none";
}

function deriveLegacyTier(args: {
	promptTrainingPolicy?: string | null;
	zeroDataRetention?: ZeroDataRetentionMode | null;
}): ProviderDataPolicyTier {
	const promptTrainingPolicy = normalizeProviderPromptTrainingPolicy(
		args.promptTrainingPolicy,
	);
	if (promptTrainingPolicy === "may_train") return "trains";
	if (promptTrainingPolicy === "opt_out_available") return "trains";
	if (promptTrainingPolicy === "no_train") {
		return args.zeroDataRetention === "default" ? "private" : "logs";
	}
	if (promptTrainingPolicy === "enterprise_no_train") {
		return args.zeroDataRetention === "default" ? "private" : "logs";
	}
	return "unknown";
}

function deriveLegacyConfidence(args: {
	promptTrainingPolicy?: string | null;
	zeroDataRetention?: ZeroDataRetentionMode | null;
}): ProviderDataPolicyConfidence {
	const promptTrainingPolicy = normalizeProviderPromptTrainingPolicy(
		args.promptTrainingPolicy,
	);
	if (promptTrainingPolicy === "no_train" && args.zeroDataRetention === "default") {
		return "confirmed";
	}
	if (
		promptTrainingPolicy === "may_train" ||
		promptTrainingPolicy === "opt_out_available" ||
		promptTrainingPolicy === "no_train" ||
		promptTrainingPolicy === "enterprise_no_train"
	) {
		return "maybe";
	}
	return "unknown";
}

export function resolveProviderDataPolicy(args: {
	tier?: ProviderDataPolicyTier | string | null;
	confidence?: ProviderDataPolicyConfidence | string | null;
	contractMode?: ProviderDataPolicyContractMode | string | null;
	promptTrainingPolicy?: string | null;
	zeroDataRetention?: ZeroDataRetentionMode | null;
}): {
	tier: ProviderDataPolicyTier;
	confidence: ProviderDataPolicyConfidence;
	contractMode: ProviderDataPolicyContractMode;
} {
	const normalizedTier = normalizeProviderDataPolicyTier(args.tier);
	const normalizedConfidence = normalizeProviderDataPolicyConfidence(
		args.confidence,
	);
	const normalizedContractMode = normalizeProviderDataPolicyContractMode(
		args.contractMode,
	);

	return {
		tier:
			normalizedTier !== "unknown"
				? normalizedTier
				: deriveLegacyTier(args),
		confidence:
			normalizedConfidence !== "unknown"
				? normalizedConfidence
				: deriveLegacyConfidence(args),
		contractMode: normalizedContractMode,
	};
}

