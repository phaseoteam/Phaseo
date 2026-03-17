export const PROVIDER_PROMPT_TRAINING_POLICY_VALUES = [
	"unknown",
	"may_train",
	"no_train",
	"opt_out_available",
	"enterprise_no_train",
] as const;

export type ProviderPromptTrainingPolicy =
	(typeof PROVIDER_PROMPT_TRAINING_POLICY_VALUES)[number];

export const PROVIDER_PROMPT_TRAINING_POLICY_LABELS: Record<
	ProviderPromptTrainingPolicy,
	string
> = {
	unknown: "Unknown",
	may_train: "May train on prompts",
	no_train: "Does not train on prompts",
	opt_out_available: "May train (opt-out available)",
	enterprise_no_train: "No training on enterprise plan",
};

export function normalizeProviderPromptTrainingPolicy(
	value: unknown,
): ProviderPromptTrainingPolicy {
	if (typeof value !== "string") return "unknown";
	const normalized = value.trim().toLowerCase();
	if (
		PROVIDER_PROMPT_TRAINING_POLICY_VALUES.includes(
			normalized as ProviderPromptTrainingPolicy,
		)
	) {
		return normalized as ProviderPromptTrainingPolicy;
	}
	return "unknown";
}
