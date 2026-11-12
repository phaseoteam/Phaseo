// Representative text.generate deployments copied from the catalogue api_providers rows
// (2026-10-28). Only the text.generate capability and its parameter ids are kept.
import type { ProviderCatalog } from "../../../../packages/testing/provider-mock/src/index";

export const TEXT_DEPLOYMENT_CATALOGS: ProviderCatalog[] = [
	{
		providerId: "groq",
		models: [{
			api_model_id: "openai/gpt-oss-120b",
			provider_model_slug: "openai/gpt-oss-120b",
			internal_model_id: "openai/gpt-oss-120b",
			provider_api_model_id: "groq:openai/gpt-oss-120b",
			is_active_gateway: true,
			effective_from: "2026-03-25T00:00:00",
			effective_to: null,
			capabilities: [{
				capability_id: "text.generate",
				status: "active",
				params: ["reasoning", "include_reasoning", "max_tokens", "temperature", "top_p", "stop", "seed", "response_format", "tools", "tool_choice", "structured_outputs", "reasoning_effort"],
			}],
		}],
	},
	{
		providerId: "together",
		models: [{
			api_model_id: "openai/gpt-oss-120b",
			provider_model_slug: "openai/gpt-oss-120b",
			internal_model_id: "openai/gpt-oss-120b",
			provider_api_model_id: "together:openai/gpt-oss-120b",
			is_active_gateway: true,
			effective_from: null,
			effective_to: null,
			capabilities: [{
				capability_id: "text.generate",
				status: "active",
				params: ["reasoning", "include_reasoning", "structured_outputs", "max_tokens", "temperature", "top_p", "stop", "frequency_penalty", "presence_penalty", "top_k", "repetition_penalty", "logit_bias", "min_p", "tools", "tool_choice", "response_format", "reasoning_effort"],
			}],
		}],
	},
	{
		providerId: "cerebras",
		models: [{
			api_model_id: "openai/gpt-oss-120b",
			provider_model_slug: "gpt-oss-120b",
			internal_model_id: "openai/gpt-oss-120b",
			provider_api_model_id: "cerebras:openai/gpt-oss-120b",
			is_active_gateway: true,
			effective_from: "2026-02-17T00:00:00",
			effective_to: null,
			capabilities: [{
				capability_id: "text.generate",
				status: "active",
				params: [{ param_id: "reasoning" }, { param_id: "structured_outputs" }, { param_id: "tools" }, { param_id: "tool_choice" }, { param_id: "max_tokens" }, { param_id: "response_format" }, { param_id: "seed" }, { param_id: "stop" }, { param_id: "temperature" }, { param_id: "top_p" }, { param_id: "include_reasoning" }, { param_id: "frequency_penalty" }, { param_id: "presence_penalty" }, { param_id: "logit_bias" }, { param_id: "reasoning_effort" }],
			}],
		}],
	},
	{
		providerId: "deepinfra",
		models: [{
			api_model_id: "openai/gpt-oss-120b",
			provider_model_slug: "openai/gpt-oss-120b",
			internal_model_id: "openai/gpt-oss-120b",
			provider_api_model_id: "deepinfra:openai/gpt-oss-120b",
			is_active_gateway: true,
			effective_from: null,
			effective_to: null,
			capabilities: [{
				capability_id: "text.generate",
				status: "active",
				params: [],
			}],
		}],
	},
	{
		providerId: "novita",
		models: [{
			api_model_id: "openai/gpt-oss-120b",
			provider_model_slug: "openai/gpt-oss-120b",
			internal_model_id: "openai/gpt-oss-120b",
			provider_api_model_id: "novita:openai/gpt-oss-120b",
			is_active_gateway: true,
			effective_from: "2026-03-25T00:00:00",
			effective_to: null,
			capabilities: [{
				capability_id: "text.generate",
				status: "active",
				params: ["max_tokens", "temperature", "top_p", "stop", "frequency_penalty", "presence_penalty", "seed", "tools", "tool_choice", "response_format", "structured_outputs", "reasoning", "include_reasoning"],
			}],
		}],
	},
	{
		providerId: "z-ai",
		models: [{
			api_model_id: "z-ai/glm-5.2",
			provider_model_slug: "glm-5.2",
			internal_model_id: "z-ai/glm-5.2",
			provider_api_model_id: "z-ai:z-ai/glm-5.2",
			is_active_gateway: true,
			effective_from: "2026-06-16T00:00:00",
			effective_to: null,
			capabilities: [{
				capability_id: "text.generate",
				status: "active",
				params: ["max_tokens", "reasoning", "response_format", "temperature", "stop", "tool_choice", "tools", "top_p", "include_reasoning", "reasoning_effort"],
			}],
		}],
	},
	{
		providerId: "deepseek",
		models: [{
			api_model_id: "deepseek/deepseek-v4-flash-0731",
			provider_model_slug: "deepseek-v4-flash",
			internal_model_id: "deepseek/deepseek-v4-flash-0731",
			provider_api_model_id: "deepseek:deepseek/deepseek-v4-flash-0731",
			is_active_gateway: true,
			effective_from: "2026-07-31T00:00:00",
			effective_to: null,
			capabilities: [{
				capability_id: "text.generate",
				status: "active",
				params: ["frequency_penalty", "include_reasoning", "logprobs", "max_tokens", "presence_penalty", "reasoning", "reasoning_effort", "response_format", "stop", "temperature", "tool_choice", "tools", "top_logprobs", "top_p"],
			}],
		}],
	},
];
