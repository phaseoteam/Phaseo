// Purpose: Code-first policy registry for text endpoint parameters.
// Why: Keeps param support/alias/quirk behavior explicit in code (not hidden in DB state).
// How: Exposes endpoint registries, aliases, always-supported rules, and provider overrides.

import type { Endpoint } from "@core/types";
import { resolveTextProviderParamPolicyOverride } from "@providers/textProfiles";

export type TextEndpoint = "chat.completions" | "responses" | "messages";

export type EndpointParamRegistry = {
	allowedTopLevel: Set<string>;
	keyToCanonicalParam: Record<string, string>;
};

const TEXT_ENDPOINT_REGISTRY: Record<TextEndpoint, EndpointParamRegistry> = {
	"chat.completions": {
		allowedTopLevel: new Set([
			"model",
			"system",
			"messages",
			"usage",
			"reasoning",
			"frequency_penalty",
			"logit_bias",
			"max_output_tokens",
			"max_completion_tokens",
			"max_tokens",
			"meta",
			"echo_upstream_request",
			"debug",
			"presence_penalty",
			"seed",
			"stream",
			"temperature",
			"tools",
			"max_tool_calls",
			"max_tools_calls",
			"parallel_tool_calls",
			"tool_choice",
			"top_k",
			"logprobs",
			"top_logprobs",
			"top_p",
			"stop",
			"response_format",
			"modalities",
			"image_config",
			"user_id",
			"user",
			"service_tier",
			"speed",
			"route",
			"session_id",
			"models",
			"plugins",
			"trace",
			"provider",
		]),
		keyToCanonicalParam: {
			tools: "tools",
			tool_choice: "tool_choice",
			parallel_tool_calls: "parallel_tool_calls",
			max_tool_calls: "max_tool_calls",
			max_tools_calls: "max_tool_calls",
			temperature: "temperature",
			top_p: "top_p",
			top_k: "top_k",
			max_tokens: "max_tokens",
			max_output_tokens: "max_tokens",
			max_completion_tokens: "max_tokens",
			stop: "stop",
			logit_bias: "logit_bias",
			seed: "seed",
			response_format: "response_format",
			modalities: "modalities",
			image_config: "image_config",
			logprobs: "logprobs",
			top_logprobs: "top_logprobs",
			presence_penalty: "presence_penalty",
			frequency_penalty: "frequency_penalty",
			reasoning: "reasoning",
			service_tier: "service_tier",
			speed: "speed",
		},
	},
	responses: {
		allowedTopLevel: new Set([
			"model",
			"models",
			"input",
			"input_items",
			"messages",
			"usage",
			"conversation",
			"include",
			"instructions",
			"max_output_tokens",
			"max_completion_tokens",
			"max_tokens",
			"max_tool_calls",
			"max_tools_calls",
			"metadata",
			"plugins",
			"session_id",
			"trace",
			"parallel_tool_calls",
			"previous_response_id",
			"frequency_penalty",
			"presence_penalty",
			"prompt",
			"prompt_cache_key",
			"prompt_cache_retention",
			"modalities",
			"image_config",
			"reasoning",
			"safety_identifier",
			"service_tier",
			"speed",
			"store",
			"stream",
			"stream_options",
			"temperature",
			"text",
			"response_format",
			"tool_choice",
			"tools",
			"top_logprobs",
			"top_p",
			"top_k",
			"truncation",
			"background",
			"user",
			"meta",
			"echo_upstream_request",
			"debug",
			"provider",
			"stop",
			"logit_bias",
			"logprobs",
			"seed",
		]),
		keyToCanonicalParam: {
			tools: "tools",
			tool_choice: "tool_choice",
			parallel_tool_calls: "parallel_tool_calls",
			max_tool_calls: "max_tool_calls",
			max_tools_calls: "max_tool_calls",
			temperature: "temperature",
			top_p: "top_p",
			top_k: "top_k",
			max_tokens: "max_tokens",
			max_output_tokens: "max_tokens",
			max_completion_tokens: "max_tokens",
			stop: "stop",
			logit_bias: "logit_bias",
			seed: "seed",
			response_format: "response_format",
			modalities: "modalities",
			image_config: "image_config",
			logprobs: "logprobs",
			top_logprobs: "top_logprobs",
			presence_penalty: "presence_penalty",
			frequency_penalty: "frequency_penalty",
			reasoning: "reasoning",
			service_tier: "service_tier",
			speed: "speed",
			prompt_cache_key: "prompt_cache_key",
			safety_identifier: "safety_identifier",
			background: "background",
			instructions: "instructions",
		},
	},
	messages: {
		allowedTopLevel: new Set([
			"model",
			"messages",
			"system",
			"usage",
			"max_tokens",
			"max_output_tokens",
			"temperature",
			"top_p",
			"top_k",
			"stream",
			"tools",
			"tool_choice",
			"metadata",
			"service_tier",
			"speed",
			"modalities",
			"image_config",
			"stop_sequences",
			"thinking",
			"meta",
			"echo_upstream_request",
			"debug",
			"provider",
		]),
		keyToCanonicalParam: {
			tools: "tools",
			tool_choice: "tool_choice",
			max_tokens: "max_tokens",
			max_output_tokens: "max_tokens",
			temperature: "temperature",
			top_p: "top_p",
			top_k: "top_k",
			stop_sequences: "stop",
			modalities: "modalities",
			image_config: "image_config",
			thinking: "reasoning",
			service_tier: "service_tier",
			speed: "speed",
		},
	},
};

const CAPABILITY_PARAM_ALIASES: Record<string, string[]> = {
	max_tokens: ["max_tokens", "max_output_tokens", "max_completion_tokens"],
	max_tool_calls: ["max_tool_calls", "max_tools_calls"],
	stop: ["stop", "stop_sequences"],
	reasoning: ["reasoning", "thinking"],
	service_tier: ["service_tier", "serviceTier"],
	response_format: ["response_format", "text", "structured_outputs"],
	image_config: ["image_config", "imageConfig"],
	logprobs: ["logprobs", "top_logprobs"],
	top_logprobs: ["top_logprobs", "logprobs"],
};

function paramPathCandidates(paramPath: string): string[] {
	const trimmed = paramPath.trim();
	if (!trimmed) return [];
	const segments = trimmed.split(".").filter(Boolean);
	const [root, ...rest] = segments;
	if (!root) return [];
	const aliases = CAPABILITY_PARAM_ALIASES[root] ?? [root];
	const suffix = rest.length > 0 ? `.${rest.join(".")}` : "";
	return Array.from(new Set(aliases.map((alias) => `${alias}${suffix}`)));
}

export function textEndpointRegistryFor(
	endpoint: Endpoint,
): EndpointParamRegistry | null {
	if (
		endpoint === "chat.completions" ||
		endpoint === "responses" ||
		endpoint === "messages"
	) {
		return TEXT_ENDPOINT_REGISTRY[endpoint];
	}
	return null;
}

export function expandCapabilityParamAliases(rootParam: string): string[] {
	return CAPABILITY_PARAM_ALIASES[rootParam] ?? [rootParam];
}

export function isAlwaysSupportedParam(endpoint: Endpoint, param: string): boolean {
	if (param === "modalities") return true;
	if (endpoint === "messages" && param === "max_tokens") return true;
	return false;
}

export function resolveProviderParamSupportOverride(
	providerId: string,
	paramPath: string,
): boolean | undefined {
	const candidates = paramPathCandidates(paramPath);
	if (!candidates.length) return undefined;
	return resolveTextProviderParamPolicyOverride({
		providerId,
		paramPathCandidates: candidates,
	});
}
