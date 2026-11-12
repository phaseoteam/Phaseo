// Representative OpenAI catalogue rows copied from api_providers/openai/models.json (2026-10-28).
// Covers chat, Responses-only, reasoning, Pro-mode, legacy completion and non-text capabilities.
// Parameter lists keep only the param ids.
export const OPENAI_MODEL_FIXTURES = [
	{
		api_model_id: "openai/babbage-002",
		provider_model_slug: "babbage-002",
		is_active_gateway: true,
		effective_from: "2023-08-22T00:00:00",
		effective_to: "2026-09-28T00:00:00",
		capabilities: [
			{ capability_id: "text.generate", status: "active", params: ["max_tokens", "response_format", "seed", "structured_outputs", "tool_choice", "tools"] },
		],
	},
	{
		api_model_id: "openai/gpt-3.5-turbo-16k",
		provider_model_slug: "gpt-3.5-turbo-16k",
		is_active_gateway: true,
		effective_from: "2023-06-13T00:00:00",
		effective_to: null,
		capabilities: [
			{ capability_id: "text.generate", status: "active", params: ["frequency_penalty", "logit_bias", "logprobs", "max_tokens", "presence_penalty", "response_format", "seed", "stop", "structured_outputs", "temperature", "tool_choice", "tools", "top_logprobs", "top_p"] },
		],
	},
	{
		api_model_id: "openai/gpt-4.1",
		provider_model_slug: "gpt-4.1-2025-04-14",
		is_active_gateway: true,
		effective_from: "2025-04-14T00:00:00",
		effective_to: null,
		capabilities: [
			{ capability_id: "text.generate", status: "active", params: ["max_tokens", "response_format", "seed", "structured_outputs", "temperature", "tool_choice", "tools", "top_p"] },
			{ capability_id: "batch", status: "active", params: ["endpoint", "completion_window"] },
		],
	},
	{
		api_model_id: "openai/gpt-4o-mini",
		provider_model_slug: "gpt-4o-mini-2024-07-18",
		is_active_gateway: true,
		effective_from: "2024-07-18T00:00:00",
		effective_to: null,
		capabilities: [
			{ capability_id: "text.generate", status: "active", params: ["frequency_penalty", "logit_bias", "logprobs", "max_tokens", "presence_penalty", "response_format", "seed", "stop", "structured_outputs", "temperature", "tool_choice", "tools", "top_logprobs", "top_p", "web_search_options"] },
			{ capability_id: "batch", status: "active", params: ["endpoint", "completion_window"] },
		],
	},
	{
		api_model_id: "openai/gpt-5-chat",
		provider_model_slug: "gpt-5-chat-latest",
		is_active_gateway: true,
		effective_from: "2025-08-07T00:00:00",
		effective_to: "2026-07-23T00:00:00",
		capabilities: [
			{ capability_id: "text.generate", status: "active", params: ["max_tokens", "response_format", "seed", "structured_outputs"] },
		],
	},
	{
		api_model_id: "openai/gpt-5.4",
		provider_model_slug: "gpt-5.4-2026-03-05",
		is_active_gateway: true,
		effective_from: "2026-03-05T00:00:00",
		effective_to: null,
		capabilities: [
			{ capability_id: "text.generate", status: "active", params: ["seed", "max_tokens", "response_format", "structured_outputs", "stop", "frequency_penalty", "presence_penalty", "logit_bias", "logprobs", "top_logprobs", "tools", "tool_choice", "temperature", "top_p", "reasoning", "include_reasoning", "reasoning_effort"] },
			{ capability_id: "batch", status: "active", params: ["endpoint", "completion_window"] },
		],
	},
	{
		api_model_id: "openai/gpt-5.6-sol",
		provider_model_slug: "gpt-5.6-sol",
		is_active_gateway: true,
		effective_from: "2026-07-09T00:00:00",
		effective_to: null,
		capabilities: [
			{ capability_id: "text.generate", status: "active", params: ["seed", "max_tokens", "reasoning", "reasoning.mode", "response_format", "structured_outputs", "stop", "tools", "tool_choice", "temperature", "top_p", "include_reasoning", "reasoning_effort", "reasoning.context", "stream"] },
			{ capability_id: "batch", status: "active", params: ["endpoint", "completion_window"] },
		],
	},
	{
		api_model_id: "openai/gpt-5.6-sol-pro",
		provider_model_slug: "gpt-5.6-sol-pro",
		is_active_gateway: true,
		effective_from: "2026-07-09T00:00:00",
		effective_to: null,
		capabilities: [
			{ capability_id: "text.generate", status: "active", params: ["seed", "max_tokens", "reasoning", "reasoning.mode", "response_format", "structured_outputs", "stop", "tools", "tool_choice", "temperature", "top_p", "include_reasoning", "reasoning_effort"] },
			{ capability_id: "batch", status: "active", params: ["endpoint", "completion_window"] },
		],
	},
	{
		api_model_id: "openai/o3",
		provider_model_slug: "o3-2025-04-16",
		is_active_gateway: true,
		effective_from: "2025-04-16T00:00:00",
		effective_to: null,
		capabilities: [
			{ capability_id: "text.generate", status: "active", params: ["include_reasoning", "max_tokens", "reasoning", "response_format", "seed", "structured_outputs", "tool_choice", "tools"] },
			{ capability_id: "batch", status: "active", params: ["endpoint", "completion_window"] },
		],
	},
	{
		api_model_id: "openai/o3-deep-research",
		provider_model_slug: "o3-deep-research-2025-06-26",
		is_active_gateway: true,
		effective_from: "2025-06-26T00:00:00",
		effective_to: "2026-07-23T00:00:00",
		capabilities: [
			{ capability_id: "text.generate", status: "active", params: ["frequency_penalty", "include_reasoning", "logit_bias", "logprobs", "max_tokens", "presence_penalty", "reasoning", "response_format", "seed", "stop", "structured_outputs", "temperature", "tool_choice", "tools", "top_logprobs", "top_p"] },
			{ capability_id: "batch", status: "active", params: ["endpoint", "completion_window"] },
		],
	},
	{
		api_model_id: "openai/gpt-4o-mini-tts",
		provider_model_slug: "gpt-4o-mini-tts",
		is_active_gateway: true,
		effective_from: "2026-03-25T00:00:00",
		effective_to: null,
		capabilities: [
			{ capability_id: "audio.speech", status: "active", params: ["input", "voice", "instructions", "response_format", "speed", "stream_format"] },
		],
	},
	{
		api_model_id: "openai/gpt-image-1",
		provider_model_slug: "gpt-image-1",
		is_active_gateway: true,
		effective_from: "2026-03-25T00:00:00",
		effective_to: "2026-10-23T00:00:00",
		capabilities: [
			{ capability_id: "image.generate", status: "active", params: ["prompt", "size", "background", "moderation", "n", "output_compression", "output_format", "partial_images", "quality", "stream", "user"] },
			{ capability_id: "image.edit", status: "active", params: ["image", "mask", "prompt", "size", "background", "moderation", "n", "output_compression", "output_format", "partial_images", "quality", "stream", "user", "input_fidelity"] },
			{ capability_id: "batch", status: "active", params: ["endpoint", "completion_window"] },
		],
	},
	{
		api_model_id: "openai/sora-2",
		provider_model_slug: "sora-2-2025-12-08",
		is_active_gateway: true,
		effective_from: "2025-09-30T00:00:00",
		effective_to: "2026-09-24T00:00:00",
		capabilities: [
			{ capability_id: "video.generate", status: "active", params: ["prompt", "duration", "size", "input_reference"] },
			{ capability_id: "batch", status: "active", params: ["endpoint", "completion_window"] },
		],
	},
	{
		api_model_id: "openai/text-embedding-3-small",
		provider_model_slug: "text-embedding-3-small",
		is_active_gateway: true,
		effective_from: "2024-01-25T00:00:00",
		effective_to: null,
		capabilities: [
			{ capability_id: "text.embed", status: "active", params: ["encoding_format", "dimensions"] },
			{ capability_id: "batch", status: "active", params: ["endpoint", "completion_window"] },
		],
	},
	{
		api_model_id: "openai/whisper-1",
		provider_model_slug: "whisper-1",
		is_active_gateway: true,
		effective_from: "2026-03-25T00:00:00",
		effective_to: null,
		capabilities: [
			{ capability_id: "audio.transcription", status: "active", params: ["language", "prompt", "temperature", "response_format", "timestamp_granularities"] },
			{ capability_id: "audio.translations", status: "active", params: ["prompt", "temperature", "response_format"] },
		],
	},
	{
		api_model_id: "openai/omni-moderation",
		provider_model_slug: "omni-moderation-latest",
		is_active_gateway: true,
		effective_from: "2024-09-26T00:00:00",
		effective_to: null,
		capabilities: [
			{ capability_id: "text.moderate", status: "active", params: ["input"] },
			{ capability_id: "batch", status: "active", params: ["endpoint", "completion_window"] },
		],
	},
	{
		api_model_id: "openai/gpt-realtime-2",
		provider_model_slug: "gpt-realtime-2",
		is_active_gateway: true,
		effective_from: "2026-05-07T00:00:00",
		effective_to: null,
		capabilities: [
			{ capability_id: "audio.realtime", status: "active", params: [] },
		],
	},
];
