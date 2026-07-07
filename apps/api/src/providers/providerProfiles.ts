// Purpose: Central provider profile registry.
// Why: Reduces scattered provider quirks so onboarding is mostly one-file.
// How: Stores capability flags and text behavior hints used by policy/normalization layers.

export type AdapterBackedCapability =
	| "image.generate"
	| "image.edit"
	| "audio.speech"
	| "audio.transcription"
	| "audio.translations"
	| "video.generate"
	| "ocr"
	| "music.generate";

export type TextReasoningEffort =
	| "none"
	| "minimal"
	| "low"
	| "medium"
	| "high"
	| "xhigh"
	| "max";

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
	if (m.includes("gpt-5.4-pro")) {
		return ["medium", "high", "xhigh"];
	}
	if (m.includes("gpt-5.4")) {
		return ["none", "low", "medium", "high", "xhigh"];
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
			paramPolicy: {
				supportedParams: [
					"provider_options.openai.context_management",
				],
			},
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
			paramPolicy: {
				supportedParams: ["service_tier"],
			},
			normalize: {
				maxTemperature: 1,
				defaultMaxTokensWhenMissing: 4096,
				reasoningEffortFallback: ["low", "medium", "high", "max"],
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
		id: "deepinfra",
		text: {
			paramPolicy: {
				supportedParams: ["service_tier"],
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
		id: "friendli",
		textOnly: true,
	},
	{
		id: "featherless",
		textOnly: true,
	},
	{
		id: "mancer",
		textOnly: true,
	},
	{
		id: "poolside",
		textOnly: true,
	},
	{
		id: "avian",
		textOnly: true,
	},
	{
		id: "baidu",
		textOnly: true,
	},
	{
		id: "inference-net",
		textOnly: true,
	},
	{
		id: "perceptron",
		textOnly: true,
	},
	{
		id: "reka",
		textOnly: true,
	},
	{
		id: "streamlake",
		textOnly: true,
	},
	{
		id: "sakana",
		textOnly: true,
		text: {
			paramPolicy: {
				supportedParams: [
					"max_output_tokens",
					"max_completion_tokens",
					"max_tokens",
					"reasoning",
					"reasoning_effort",
					"tools",
					"tool_choice",
					"response_format",
					"structured_outputs",
					"parallel_tool_calls",
					"temperature",
					"top_p",
					"stop",
					"seed",
					"frequency_penalty",
					"presence_penalty",
					"metadata",
					"stream",
				],
			},
			normalize: {
				reasoningEffortFallback: ["high", "xhigh"],
			},
		},
	},
	{
		id: "thinking-machines",
		textOnly: true,
	},
	{
		id: "upstage",
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
