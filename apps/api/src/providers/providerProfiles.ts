// Purpose: Central provider profile registry.
// Why: Reduces scattered provider quirks so onboarding is mostly one-file.
// How: Stores capability flags and text behavior hints used by policy/normalization layers.

export type AdapterBackedCapability =
	| "image.generate"
	| "image.edit"
	| "audio.speech"
	| "audio.transcription"
	| "audio.translations"
	| "ocr"
	| "music.generate";

export type TextReasoningEffort =
	| "none"
	| "minimal"
	| "low"
	| "medium"
	| "high"
	| "xhigh";

export type ProviderProfile = {
	id: string;
	aliases?: string[];
	textOnly?: boolean;
	adapterBackedOverrides?: Partial<Record<AdapterBackedCapability, boolean>>;
	text?: {
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
};

function openAIReasoningFallback(model: string): TextReasoningEffort[] {
	const m = model.toLowerCase();
	if (m.includes("gpt-5.1-codex-max")) {
		return ["none", "minimal", "low", "medium", "high", "xhigh"];
	}
	if (m.includes("gpt-5.2") || m.includes("gpt-5.3")) {
		return ["none", "minimal", "low", "medium", "high", "xhigh"];
	}
	if (m.includes("gpt-5.1")) {
		return ["none", "minimal", "low", "medium", "high"];
	}
	if (m.includes("gpt-5")) {
		return ["minimal", "low", "medium", "high"];
	}
	return ["none", "minimal", "low", "medium", "high", "xhigh"];
}

const PROVIDER_PROFILES: ProviderProfile[] = [
	{
		id: "openai",
		aliases: ["azure"],
		text: {
			normalize: {
				maxTemperature: 2,
				serviceTierAliases: {
					standard: "default",
				},
				reasoningEffortFallback: openAIReasoningFallback,
			},
		},
	},
	{
		id: "anthropic",
		text: {
			normalize: {
				maxTemperature: 1,
				defaultMaxTokensWhenMissing: 4096,
				reasoningEffortFallback: ["low", "medium", "high", "xhigh"],
			},
		},
	},
	{
		id: "cerebras",
		text: {
			paramPolicy: {
				unsupportedParams: [
					"frequency_penalty",
					"presence_penalty",
					"logit_bias",
				],
			},
			normalize: {
				maxTemperature: 2,
				serviceTierAliases: {
					standard: "default",
				},
			},
		},
	},
	{
		id: "arcee-ai",
		aliases: ["arcee"],
		textOnly: true,
	},
	{
		id: "ai21",
		textOnly: true,
	},
	{
		id: "xiaomi",
		textOnly: true,
	},
];

const PROFILE_INDEX = new Map<string, ProviderProfile>();
for (const profile of PROVIDER_PROFILES) {
	PROFILE_INDEX.set(profile.id, profile);
	for (const alias of profile.aliases ?? []) {
		PROFILE_INDEX.set(alias, profile);
	}
}

function normalizeProviderId(providerId: string): string {
	return providerId.trim().toLowerCase();
}

export function getProviderProfile(providerId: string): ProviderProfile | null {
	return PROFILE_INDEX.get(normalizeProviderId(providerId)) ?? null;
}
