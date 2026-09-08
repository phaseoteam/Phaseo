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
	| "parse"
	| "music.generate";

export type TextReasoningEffort =
	| "none"
	| "instant"
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
		endpointSupport?: {
			interactionsModels?: string[];
		};
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
	if (m.includes("gpt-5.6")) {
		return ["none", "low", "medium", "high", "xhigh", "max"];
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
		id: "tencent-cloud",
		textOnly: true,
	},
	{
		id: "atlascloud",
		aliases: ["atlas-cloud"],
		adapterBackedOverrides: {
			"image.generate": false,
			"image.edit": false,
			"audio.speech": false,
			"audio.transcription": false,
			"audio.translations": false,
			"video.generate": true,
		},
	},
	{
		id: "google-ai-studio",
		text: {
			endpointSupport: {
				interactionsModels: [
					"gemini-2.5-flash",
					"gemini-2.5-flash-lite",
					"gemini-2.5-pro",
					"gemini-3-flash-preview",
					"gemini-3.1-flash-image",
					"gemini-3.1-flash-lite",
					"gemini-3.1-flash-tts-preview",
					"gemini-3.1-pro-preview",
					"gemini-3-pro-image",
					"gemini-3.5-flash",
					"gemini-3.5-flash-lite",
					"gemini-3.6-flash",
					"gemini-3.7-flash",
					"gemini-3.8-flash",
					"gemini-robotics-er-2-preview",
					"gemma-4-26b-a4b-it",
					"gemma-4-31b-it",
					"lyria-3-clip-preview",
					"lyria-3-pro-preview",
				],
			},
		},
		adapterBackedOverrides: {
			"image.generate": true,
			"image.edit": false,
			"audio.speech": true,
			"audio.transcription": true,
			"audio.translations": false,
			"video.generate": true,
		},
	},
	{
		id: "google-vertex",
		adapterBackedOverrides: {
			"image.generate": false,
			"image.edit": false,
			"audio.speech": false,
			"audio.transcription": true,
			"audio.translations": false,
			"video.generate": true,
		},
	},
	{
		id: "google-vertex-eu",
		adapterBackedOverrides: {
			"image.generate": false,
			"image.edit": false,
			"audio.speech": false,
			"audio.transcription": false,
			"audio.translations": false,
			"video.generate": false,
		},
	},
	{
		id: "x-ai",
		aliases: ["xai", "spacex-ai"],
		adapterBackedOverrides: {
			"image.generate": true,
			"image.edit": true,
			"audio.speech": true,
			"audio.transcription": true,
			"audio.translations": false,
			"video.generate": true,
		},
	},
	{
		id: "openai",
		aliases: ["azure"],
		text: {
			paramPolicy: {
				supportedParams: [
					"provider_options.openai.context_management",
					"reasoning.mode",
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
				unsupportedParams: ["presence_penalty"],
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
		id: "cohere",
		text: {
			paramPolicy: {
				unsupportedParams: [
					"stream_options",
					"store",
					"metadata",
					"logit_bias",
					"top_logprobs",
					"n",
					"modalities",
					"service_tier",
					"parallel_tool_calls",
					"tool_choice",
					"logprobs",
					"repetition_penalty",
					"top_k",
				],
			},
			normalize: {
				maxTemperature: 1,
				reasoningEffortFallback: ["high"],
			},
		},
	},
	{
		id: "deepinfra",
		text: {
			paramPolicy: {
				supportedParams: ["service_tier", "reasoning.effort", "provider_options.deepinfra"],
			},
			normalize: {
				maxTemperature: 2,
				serviceTierAliases: {
					standard: "default",
				},
				reasoningEffortFallback: ["none", "minimal", "low", "medium", "high", "xhigh", "max"],
			},
		},
	},
	{
		id: "fireworks",
		text: {
			paramPolicy: {
				supportedParams: ["n", "top_k", "repetition_penalty", "service_tier", "reasoning.effort", "provider_options.fireworks"],
			},
			normalize: {
				maxTemperature: 2,
				serviceTierAliases: { standard: "default" },
				reasoningEffortFallback: ["none", "low", "medium", "high", "xhigh", "max"],
			},
		},
	},
	{
		id: "hyperbolic",
		text: {
			paramPolicy: {
				supportedParams: ["n", "top_k", "min_p", "repetition_penalty", "logprobs", "top_logprobs"],
				unsupportedParams: [
					"tools", "tool_choice", "parallel_tool_calls", "max_tool_calls",
					"response_format", "reasoning", "modalities", "image_config",
					"prompt_cache_key", "prompt_cache_retention", "service_tier",
					"metadata", "background", "safety_identifier", "stream_options",
				],
			},
		},
	},
	{
		id: "infermatic",
		text: {
			paramPolicy: {
				supportedParams: ["n", "top_k", "min_p", "repetition_penalty"],
				unsupportedParams: [
					"tools", "tool_choice", "parallel_tool_calls", "max_tool_calls",
					"response_format", "reasoning", "modalities", "image_config",
					"prompt_cache_key", "prompt_cache_retention", "service_tier",
					"metadata", "background", "safety_identifier", "stream_options",
				],
			},
			normalize: { maxTemperature: 2 },
		},
	},
	{
		id: "inflection",
		text: {
			paramPolicy: {
				supportedParams: [
					"n", "tools", "tool_choice", "parallel_tool_calls",
					"response_format", "stream_options", "logprobs", "top_logprobs",
				],
			},
			normalize: { maxTemperature: 2 },
		},
	},
	{
		id: "longcat",
		textOnly: true,
		text: {
			paramPolicy: {
				supportedParams: ["reasoning"],
				unsupportedParams: [
					"n", "tools", "tool_choice", "parallel_tool_calls", "max_tool_calls",
					"response_format", "frequency_penalty", "presence_penalty", "logit_bias",
					"logprobs", "top_logprobs", "top_k", "min_p", "repetition_penalty",
					"seed", "stop", "user", "stream_options", "modalities", "image_config",
					"prompt_cache_key", "prompt_cache_retention", "service_tier", "metadata",
				],
			},
			normalize: { maxTemperature: 1 },
		},
	},
	{
		id: "mara",
		textOnly: true,
		text: {
			paramPolicy: {
				supportedParams: ["top_k"],
				unsupportedParams: [
					"n", "logprobs", "top_logprobs", "presence_penalty",
					"frequency_penalty", "logit_bias", "seed",
				],
			},
			normalize: { maxTemperature: 1 },
		},
	},
	{
		id: "deepseek",
		textOnly: true,
		text: {
			paramPolicy: {
				supportedParams: [
					"max_tokens", "temperature", "top_p", "stop", "stream_options",
					"tools", "tool_choice", "response_format", "logprobs", "top_logprobs",
					"user", "user_id", "reasoning.effort",
				],
				unsupportedParams: [
					"top_k", "logit_bias", "parallel_tool_calls", "max_tool_calls", "seed",
					"frequency_penalty", "presence_penalty", "repetition_penalty", "metadata",
					"modalities", "service_tier", "web_search_options",
				],
			},
			normalize: {
				maxTemperature: 2,
				reasoningEffortFallback: ["high", "max"],
			},
		},
	},
	{
		id: "mistral",
		text: {
			paramPolicy: {
				supportedParams: ["max_tokens", "reasoning.enabled", "reasoning.effort", "service_tier"],
			},
			normalize: { reasoningEffortFallback: ["none", "low", "medium", "high", "max"] },
		},
	},
	{
		id: "nebius-token-factory",
		aliases: [
			"nebius-token-factory-fast",
			"nebius-token-factory-eu-north-1",
			"nebius-token-factory-us-central-1",
		],
		text: {
			paramPolicy: {
				supportedParams: [
					"max_tokens", "max_output_tokens", "max_completion_tokens",
					"temperature", "top_p", "tools", "tool_choice", "parallel_tool_calls",
					"n", "stream_options", "stop", "presence_penalty", "frequency_penalty",
					"logit_bias", "logprobs", "top_logprobs", "user", "response_format",
					"service_tier", "store", "reasoning.effort", "metadata", "include",
					"previous_response_id", "prompt", "background", "truncation",
					"max_tool_calls", "prompt_cache_key",
				],
			},
			normalize: {
				maxTemperature: 2,
				reasoningEffortFallback: ["none", "minimal", "low", "medium", "high", "xhigh"],
			},
		},
	},
	{
		id: "parasail",
		adapterBackedOverrides: {
			"image.generate": false,
			"image.edit": false,
			"audio.speech": false,
			"audio.transcription": false,
			"audio.translations": false,
			"video.generate": false,
		},
	},
	{
		id: "phala",
		adapterBackedOverrides: {
			"image.generate": false,
			"image.edit": false,
			"audio.speech": false,
			"audio.transcription": false,
			"audio.translations": false,
			"video.generate": false,
		},
	},
	{
		id: "novita",
		aliases: ["novitaai", "novita-ai"],
		adapterBackedOverrides: {
			"video.generate": true,
			"image.generate": false,
			"image.edit": false,
			"audio.speech": false,
			"audio.transcription": false,
			"audio.translations": false,
		},
		text: {
			paramPolicy: {
				supportedParams: [
					"max_tokens", "temperature", "top_p", "top_k", "min_p", "n", "seed",
					"frequency_penalty", "presence_penalty", "repetition_penalty", "stop",
					"logit_bias", "logprobs", "top_logprobs", "tools", "tool_choice",
					"response_format", "stream_options", "modalities", "reasoning.effort",
				],
			},
			normalize: {
				maxTemperature: 2,
				reasoningEffortFallback: ["none", "high"],
			},
		},
	},
	{
		id: "mistral-eu",
		textOnly: true,
		text: {
			paramPolicy: {
				supportedParams: ["service_tier"],
			},
		},
	},
	{
		id: "morph",
		text: {
			paramPolicy: {
				supportedParams: ["reasoning.effort", "response_format", "tools", "logprobs", "top_logprobs", "service_tier"],
			},
			normalize: {
				maxTemperature: 2,
				serviceTierAliases: { standard: "default", flex: "standby" },
				reasoningEffortFallback: ["low", "medium", "high"],
			},
		},
	},
	{
		id: "arcee-ai",
		aliases: ["arcee"],
		textOnly: true,
		text: {
			paramPolicy: {
				supportedParams: ["n", "reasoning.effort"],
			},
			normalize: {
				maxTemperature: 2,
				reasoningEffortFallback: ["minimal", "low", "medium", "high"],
			},
		},
	},
	{
		id: "ai21",
		textOnly: true,
		text: {
			paramPolicy: {
				supportedParams: [
					"max_tokens",
					"temperature",
					"top_p",
					"stop",
					"n",
					"documents",
					"tools",
					"response_format",
				],
				unsupportedParams: [
					"reasoning",
					"frequency_penalty",
					"presence_penalty",
					"seed",
					"logprobs",
					"top_logprobs",
					"parallel_tool_calls",
					"web_search_options",
				],
			},
			normalize: { maxTemperature: 2 },
		},
	},
	{
		id: "akashml",
		text: {
			paramPolicy: {
				supportedParams: [
					"max_tokens",
					"temperature",
					"top_p",
					"frequency_penalty",
					"presence_penalty",
					"stop",
					"stream_options",
					"tools",
					"tool_choice",
					"parallel_tool_calls",
					"response_format",
					"seed",
					"n",
					"user",
					"logprobs",
					"top_logprobs",
					"logit_bias",
					"service_tier",
					"modalities",
					"reasoning.effort",
				],
			},
			normalize: {
				maxTemperature: 2,
				reasoningEffortFallback: ["low", "medium", "high"],
			},
		},
	},
	{
		id: "friendli",
		adapterBackedOverrides: {
			"image.generate": true,
			"image.edit": true,
			"audio.transcription": true,
			"audio.speech": false,
			"audio.translations": false,
			"video.generate": false,
		},
		text: {
			paramPolicy: {
				supportedParams: [
					"max_tokens", "temperature", "top_p", "top_k", "frequency_penalty",
					"presence_penalty", "repetition_penalty", "logit_bias", "logprobs",
					"top_logprobs", "seed", "stop", "stream_options", "n", "tools",
					"tool_choice", "parallel_tool_calls", "response_format", "reasoning.effort",
				],
			},
			normalize: {
				maxTemperature: 2,
				reasoningEffortFallback: ["minimal", "low", "medium", "high", "xhigh", "max"],
			},
		},
	},
	{
		id: "inception",
		textOnly: true,
		text: {
			paramPolicy: {
				supportedParams: [
					"max_tokens", "temperature", "stop", "stream_options", "tools",
					"tool_choice", "response_format", "reasoning.effort",
					"diffusing", "realtime", "reasoning_summary", "reasoning_summary_wait",
				],
				unsupportedParams: [
					"top_p", "top_k", "frequency_penalty", "presence_penalty",
					"repetition_penalty", "seed", "logprobs", "top_logprobs",
					"parallel_tool_calls", "modalities", "web_search_options",
				],
			},
			normalize: {
				maxTemperature: 1,
				reasoningEffortFallback: ["instant", "low", "medium", "high"],
			},
		},
	},
	{
		id: "ionrouter",
		adapterBackedOverrides: {
			"image.generate": true,
			"image.edit": false,
			"audio.speech": true,
			"audio.transcription": false,
			"audio.translations": false,
			"video.generate": false,
		},
		text: {
			paramPolicy: {
				supportedParams: ["max_tokens", "temperature", "top_p", "stream"],
			},
			normalize: { maxTemperature: 2 },
		},
	},
	{
		id: "groq",
		text: {
			paramPolicy: {
				supportedParams: [
					"max_tokens", "temperature", "top_p", "stop", "seed",
					"tools", "tool_choice", "parallel_tool_calls", "max_tool_calls",
					"response_format", "top_logprobs", "service_tier", "reasoning.effort",
				],
				unsupportedParams: [
					"frequency_penalty", "presence_penalty", "logit_bias", "logprobs",
				],
			},
			normalize: {
				maxTemperature: 2,
				reasoningEffortFallback: ["none", "low", "medium", "high"],
			},
		},
	},
	{
		id: "gmicloud",
		adapterBackedOverrides: {
			"image.generate": false,
			"image.edit": false,
			"audio.speech": false,
			"audio.transcription": false,
			"audio.translations": false,
			"video.generate": false,
		},
		text: {
			paramPolicy: {
				supportedParams: [
					"max_tokens", "temperature", "top_p", "top_k", "stop", "tools",
					"response_format", "stream_options",
					"provider_options.gmicloud.ignore_eos",
					"provider_options.gmicloud.context_length_exceeded_behavior",
				],
			},
			normalize: { maxTemperature: 2 },
		},
	},
	{
		id: "featherless",
		text: {
			paramPolicy: {
				supportedParams: [
					"max_tokens", "temperature", "top_p", "top_k", "min_p",
					"frequency_penalty", "presence_penalty", "repetition_penalty",
					"seed", "stop", "tools", "response_format",
				],
			},
		},
	},
	{
		id: "ambient",
	},
	{
		id: "mancer",
		textOnly: true,
		text: {
			paramPolicy: {
				supportedParams: [
					"max_tokens", "temperature", "top_p", "top_k", "min_p",
					"frequency_penalty", "presence_penalty", "repetition_penalty",
					"logit_bias", "logprobs", "top_logprobs", "seed", "stop",
					"n", "tools", "tool_choice", "response_format", "reasoning",
					"respond_as", "min_tokens", "custom_token_bans",
					"dynatemp_mode", "dynatemp_min", "dynatemp_max", "dynatemp_exponent",
					"epsilon_cutoff", "top_a", "typical_p", "eta_cutoff", "tfs",
					"smoothing_factor", "smoothing_curve", "xtc_probability", "xtc_threshold",
					"dry_multiplier", "dry_base", "dry_allowed_length", "dry_range",
					"dry_sequence_breakers", "ignore_eos", "custom_timeout", "allow_logging",
				],
			},
			normalize: { maxTemperature: 2 },
		},
	},
	{
		id: "poolside",
		textOnly: true,
		text: {
			paramPolicy: {
				supportedParams: [
					"max_tokens",
					"temperature",
					"top_k",
					"min_p",
					"tools",
					"parallel_tool_calls",
					"reasoning.enabled",
				],
			},
			normalize: { maxTemperature: 2 },
		},
	},
	{
		id: "avian",
		textOnly: true,
		text: {
			paramPolicy: {
				supportedParams: [
					"max_tokens",
					"temperature",
					"tools",
					"tool_choice",
					"parallel_tool_calls",
					"response_format",
				],
			},
			normalize: { maxTemperature: 2 },
		},
	},
	{
		id: "baseten",
		text: {
			paramPolicy: {
				supportedParams: [
					"max_tokens",
					"temperature",
					"top_p",
					"top_k",
					"frequency_penalty",
					"presence_penalty",
					"logit_bias",
					"logprobs",
					"top_logprobs",
					"seed",
					"stop",
					"stream_options",
					"n",
					"tools",
					"tool_choice",
					"parallel_tool_calls",
					"response_format",
					"user",
					"modalities",
					"reasoning.effort",
				],
			},
			normalize: {
				maxTemperature: 4,
				reasoningEffortFallback: ["none", "minimal", "low", "medium", "high", "xhigh", "max"],
			},
		},
	},
	{
		id: "baidu",
	},
	{
		id: "minimax",
		adapterBackedOverrides: {
			"image.generate": true,
			"image.edit": true,
			"audio.speech": true,
			"audio.transcription": false,
			"audio.translations": false,
		},
	},
	{
		id: "minimax-lightning",
		adapterBackedOverrides: {
			"image.generate": false,
			"image.edit": false,
			"audio.speech": false,
			"audio.transcription": false,
			"audio.translations": false,
		},
	},
	{
		id: "inference-net",
		text: {
			paramPolicy: {
				supportedParams: [
					"max_tokens", "temperature", "top_p", "frequency_penalty",
					"presence_penalty", "response_format", "tools", "reasoning.effort",
				],
			},
			normalize: {
				maxTemperature: 2,
				reasoningEffortFallback: ["none", "minimal", "low", "medium", "high", "xhigh", "max"],
			},
		},
	},
	{
		id: "io-net",
		adapterBackedOverrides: {
			"image.generate": false,
			"image.edit": false,
			"audio.speech": false,
			"audio.transcription": false,
			"audio.translations": false,
			"video.generate": false,
		},
		text: {
			paramPolicy: {
				supportedParams: [
					"max_tokens", "temperature", "top_p", "stop", "seed",
					"frequency_penalty", "presence_penalty", "logprobs", "top_logprobs",
					"response_format", "tools", "tool_choice", "reasoning.effort",
				],
			},
			normalize: {
				maxTemperature: 2,
				reasoningEffortFallback: ["none", "minimal", "low", "medium", "high", "xhigh", "max"],
			},
		},
	},
	{
		id: "perplexity",
		textOnly: true,
		text: {
			paramPolicy: {
				supportedParams: [
					"max_tokens", "temperature", "top_p", "stop", "response_format",
					"reasoning.effort", "web_search_options",
				],
				unsupportedParams: [
					"n", "tools", "tool_choice", "parallel_tool_calls", "max_tool_calls",
					"frequency_penalty", "presence_penalty", "repetition_penalty", "logit_bias",
					"logprobs", "top_logprobs", "top_k", "min_p", "seed", "metadata",
					"modalities", "image_config", "service_tier", "stream_options",
					"prompt_cache_key", "prompt_cache_retention", "safety_identifier",
				],
			},
			normalize: {
				maxTemperature: 2,
				reasoningEffortFallback: ["minimal", "low", "medium", "high"],
			},
		},
	},
	{
		id: "perceptron",
		textOnly: true,
	},
	{
		id: "sambanova",
		textOnly: true,
		text: {
			paramPolicy: {
				supportedParams: [
					"max_tokens", "temperature", "top_p", "top_k", "stop", "stream_options",
					"response_format", "reasoning.effort", "tools", "tool_choice", "n",
					"logprobs", "top_logprobs", "seed",
				],
				unsupportedParams: [
					"presence_penalty", "frequency_penalty", "logit_bias", "parallel_tool_calls",
					"max_tool_calls", "repetition_penalty", "min_p", "metadata", "modalities",
					"image_config", "service_tier", "prompt_cache_key", "prompt_cache_retention",
					"web_search_options", "safety_identifier",
				],
			},
			normalize: {
				maxTemperature: 2,
				reasoningEffortFallback: ["low", "medium", "high"],
			},
		},
	},
	{
		id: "scaleway",
		textOnly: false,
		adapterBackedOverrides: {
			"image.generate": false,
			"image.edit": false,
			"audio.speech": false,
			"audio.transcription": true,
			"audio.translations": false,
			"video.generate": false,
		},
		text: {
			paramPolicy: {
				supportedParams: [
					"max_tokens", "temperature", "top_p", "stop", "response_format",
					"tools", "tool_choice", "parallel_tool_calls", "reasoning.effort",
				],
				unsupportedParams: [
					"background", "metadata", "previous_response_id", "prompt_cache_key",
					"safety_identifier", "service_tier", "stream_options", "top_logprobs",
					"user", "max_tool_calls", "web_search_options", "modalities", "image_config",
				],
			},
			normalize: { maxTemperature: 2 },
		},
	},
	{
		id: "reka",
		text: {
			paramPolicy: {
				supportedParams: [
					"max_tokens", "temperature", "top_p", "top_k", "seed", "stop",
					"frequency_penalty", "presence_penalty", "tools", "tool_choice",
				],
				unsupportedParams: [
					"parallel_tool_calls", "max_tool_calls", "logit_bias", "logprobs",
					"top_logprobs", "service_tier", "metadata", "reasoning",
				],
			},
			normalize: { maxTemperature: 2 },
		},
	},
	{
		id: "siliconflow",
		adapterBackedOverrides: {
			"image.generate": true,
			"image.edit": false,
			"audio.speech": true,
			"audio.transcription": true,
			"audio.translations": false,
			"video.generate": false,
		},
		text: {
			paramPolicy: {
				supportedParams: [
					"max_tokens", "temperature", "top_p", "top_k", "min_p", "stop",
					"frequency_penalty", "n", "response_format", "tools",
					"reasoning.enabled", "reasoning.max_tokens",
				],
				unsupportedParams: [
					"presence_penalty", "repetition_penalty", "logit_bias", "logprobs",
					"top_logprobs", "parallel_tool_calls", "max_tool_calls", "metadata",
					"service_tier", "web_search_options",
				],
			},
		},
	},
	{
		id: "stepfun",
		adapterBackedOverrides: {
			"image.generate": true,
			"image.edit": true,
			"audio.speech": true,
			"audio.transcription": true,
			"audio.translations": false,
			"video.generate": false,
		},
		text: {
			paramPolicy: {
				supportedParams: [
					"max_tokens", "max_output_tokens", "temperature", "top_p", "n", "stop",
					"frequency_penalty", "response_format", "tools", "reasoning.effort",
					"modalities", "audio", "reasoning_format",
				],
				unsupportedParams: [
					"presence_penalty", "repetition_penalty", "top_k", "min_p", "seed",
					"logit_bias", "logprobs", "top_logprobs", "tool_choice", "parallel_tool_calls",
					"max_tool_calls", "metadata", "service_tier", "web_search_options",
				],
			},
			normalize: {
				maxTemperature: 2,
				reasoningEffortFallback: ["low", "medium", "high"],
			},
		},
	},
	{
		id: "streamlake",
		text: {
			paramPolicy: {
				supportedParams: [
					"max_tokens",
					"temperature",
					"top_p",
					"stop",
					"tools",
					"tool_choice",
					"stream",
				],
			},
		},
	},
	{
		id: "tensorix",
		aliases: ["tensorx"],
		text: {
			paramPolicy: {
				supportedParams: [
					"max_tokens", "temperature", "top_p", "top_k", "stop",
					"presence_penalty", "frequency_penalty", "response_format",
					"tools", "tool_choice", "parallel_tool_calls", "stream_options",
					"reasoning.effort", "provider_options.tensorx.chat_template_kwargs",
				],
				unsupportedParams: [
					"background", "metadata", "modalities", "image_config", "service_tier",
					"web_search_options", "max_tool_calls", "prompt_cache_key",
				],
			},
			normalize: {
				maxTemperature: 2,
				reasoningEffortFallback: ["none", "low", "medium", "high", "max"],
			},
		},
	},
	{
		id: "switchpoint",
		textOnly: true,
		text: {
			paramPolicy: {
				supportedParams: ["stream"],
				unsupportedParams: [
					"tools", "tool_choice", "parallel_tool_calls", "max_tool_calls",
					"response_format", "reasoning", "modalities", "image_config",
					"background", "metadata", "service_tier", "web_search_options",
					"stream_options",
				],
			},
		},
	},
	{
		id: "sakana",
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
				reasoningEffortFallback: (model) => {
					const normalized = model.split("/").pop()?.toLowerCase();
					return normalized === "fugu-ultra" || normalized === "fugu-ultra-v1.1"
						? ["high", "xhigh", "max"]
						: ["high", "xhigh"];
				},
			},
		},
	},
	{
		id: "thinking-machines",
		textOnly: true,
		text: {
			paramPolicy: {
				supportedParams: [
					"max_tokens", "temperature", "top_p", "top_k", "stop", "seed",
					"reasoning.effort", "provider_options.thinking-machines.separate_reasoning",
				],
				unsupportedParams: [
					"tools", "tool_choice", "parallel_tool_calls", "max_tool_calls",
					"response_format", "modalities", "image_config", "service_tier",
					"metadata", "background", "web_search_options", "stream_options",
				],
			},
			normalize: { reasoningEffortFallback: ["none", "low", "medium", "high", "max"] },
		},
	},
	{
		id: "upstage",
		adapterBackedOverrides: { ocr: true },
		text: {
			paramPolicy: {
				supportedParams: [
					"max_tokens", "temperature", "top_p", "tools", "tool_choice",
					"response_format", "reasoning.effort",
				],
				unsupportedParams: [
					"top_k", "min_p", "repetition_penalty", "parallel_tool_calls",
					"max_tool_calls", "modalities", "image_config", "metadata", "background",
					"service_tier", "web_search_options", "stream_options",
				],
			},
			normalize: { maxTemperature: 2, reasoningEffortFallback: ["low", "medium", "high"] },
		},
	},
	{
		id: "venice",
		adapterBackedOverrides: {
			"image.generate": true,
			"image.edit": false,
			"audio.speech": true,
			"audio.transcription": true,
			"audio.translations": false,
			"video.generate": false,
		},
		text: {
			paramPolicy: {
				supportedParams: ["provider_options.venice", "reasoning.effort"],
			},
			normalize: {
				maxTemperature: 2,
				reasoningEffortFallback: ["none", "minimal", "low", "medium", "high", "xhigh", "max"],
			},
		},
	},
	{
		id: "venice-e2ee",
		textOnly: true,
	},
	{
		id: "weights-and-biases",
		textOnly: true,
		text: {
			paramPolicy: {
				supportedParams: [
					"max_tokens", "temperature", "top_p", "top_k", "repetition_penalty",
					"frequency_penalty", "presence_penalty", "stop", "seed", "tools",
					"tool_choice", "response_format", "logprobs", "top_logprobs",
					"stream_options", "reasoning.enabled",
				],
				unsupportedParams: [
					"parallel_tool_calls", "max_tool_calls", "modalities", "image_config",
					"metadata", "background", "service_tier", "web_search_options",
				],
			},
			normalize: { maxTemperature: 2, reasoningEffortFallback: ["none", "high"] },
		},
	},
	{
		id: "z-ai",
		aliases: ["zai"],
		adapterBackedOverrides: {
			"image.generate": false,
			"image.edit": false,
			"audio.speech": false,
			"audio.transcription": false,
			"audio.translations": false,
			"video.generate": false,
		},
		text: {
			paramPolicy: {
				supportedParams: [
					"max_tokens", "temperature", "top_p", "stop", "tools", "tool_choice",
					"response_format", "reasoning.enabled", "provider_options.zai.tool_stream",
				],
				unsupportedParams: [
					"frequency_penalty", "presence_penalty", "repetition_penalty", "logit_bias",
					"logprobs", "top_logprobs", "service_tier", "parallel_tool_calls", "max_tool_calls",
				],
			},
			normalize: { maxTemperature: 1, reasoningEffortFallback: ["none", "high"] },
		},
	},
	{
		id: "crofai",
		textOnly: true,
		text: {
			paramPolicy: {
				supportedParams: ["service_tier"],
			},
		},
	},
	{
		id: "wafer",
		textOnly: true,
		text: {
			paramPolicy: {
				supportedParams: ["service_tier"],
			},
		},
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
