// Purpose: Pipeline module for the gateway request lifecycle.
// Why: Keeps parameter capability checks centralized and reusable.
// How: Normalizes endpoint params, validates unknown fields, and filters providers by support.

import type { Endpoint } from "@core/types";
import type { ProviderCandidate } from "./types";
import { err } from "./http";

type ProviderSupportInfo = {
	providerId: string;
	supported: boolean;
};

type TextEndpoint = "chat.completions" | "responses" | "messages";

type EndpointParamRegistry = {
	allowedTopLevel: Set<string>;
	keyToCanonicalParam: Record<string, string>;
};

const ENDPOINT_REGISTRY: Record<TextEndpoint, EndpointParamRegistry> = {
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
			"user_id",
			"user",
			"service_tier",
			"speed",
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
			stop: "stop",
			logit_bias: "logit_bias",
			seed: "seed",
			response_format: "response_format",
			modalities: "modalities",
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
			"input",
			"input_items",
			"messages",
			"usage",
			"conversation",
			"include",
			"instructions",
			"max_output_tokens",
			"max_tokens",
			"max_tool_calls",
			"max_tools_calls",
			"metadata",
			"parallel_tool_calls",
			"previous_response_id",
			"frequency_penalty",
			"presence_penalty",
			"prompt",
			"prompt_cache_key",
			"prompt_cache_retention",
			"modalities",
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
			stop: "stop",
			logit_bias: "logit_bias",
			seed: "seed",
			response_format: "response_format",
			modalities: "modalities",
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
			thinking: "reasoning",
			service_tier: "service_tier",
			speed: "speed",
		},
	},
};

const CAPABILITY_PARAM_ALIASES: Record<string, string[]> = {
	max_tokens: ["max_tokens", "max_output_tokens"],
	max_tool_calls: ["max_tool_calls", "max_tools_calls"],
	stop: ["stop", "stop_sequences"],
	reasoning: ["reasoning", "thinking"],
	service_tier: ["service_tier", "serviceTier"],
	response_format: ["response_format", "text", "structured_outputs"],
	logprobs: ["logprobs", "top_logprobs"],
	top_logprobs: ["top_logprobs", "logprobs"],
};

function normalizeParamPaths(paths: string[]): string[] {
	const unique = new Set<string>();
	for (const p of paths) {
		if (typeof p === "string" && p.trim().length) unique.add(p);
	}
	return Array.from(unique);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getObjectChildParamPaths(base: string, value: unknown): string[] {
	if (!isPlainObject(value)) return [];
	const out: string[] = [];
	for (const [key, childValue] of Object.entries(value)) {
		if (childValue === undefined || childValue === null) continue;
		out.push(`${base}.${key}`);
	}
	return out;
}

function hasNestedPath(obj: Record<string, unknown>, segments: string[]): boolean {
	let cursor: unknown = obj;
	for (const segment of segments) {
		if (!isPlainObject(cursor) || !(segment in cursor)) return false;
		cursor = (cursor as Record<string, unknown>)[segment];
	}
	return true;
}

function registryFor(endpoint: Endpoint): EndpointParamRegistry | null {
	if (endpoint === "chat.completions" || endpoint === "responses" || endpoint === "messages") {
		return ENDPOINT_REGISTRY[endpoint];
	}
	return null;
}

function hasToolUsageInMessages(messages: any[]): boolean {
	return messages.some((msg) =>
		msg &&
		(typeof msg.tool_call_id === "string" ||
			msg.role === "tool" ||
			(Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0))
	);
}

function hasToolUsageInResponsesInput(items: any[]): boolean {
	return items.some((item) =>
		item &&
		(item.type === "function_call" ||
			item.type === "function_call_output" ||
			item.tool_call_id ||
			item.call_id)
	);
}

export function getUnknownTopLevelParams(endpoint: Endpoint, rawBody: any): string[] {
	if (!rawBody || typeof rawBody !== "object") return [];
	const registry = registryFor(endpoint);
	if (!registry) return [];
	return Object.keys(rawBody).filter((key) => !registry.allowedTopLevel.has(key));
}

export function extractRequestedParams(endpoint: Endpoint, rawBody: any): string[] {
	if (!rawBody || typeof rawBody !== "object") return [];
	const registry = registryFor(endpoint);
	if (!registry) return [];

	const params: string[] = [];
	for (const [key, canonical] of Object.entries(registry.keyToCanonicalParam)) {
		if (Object.prototype.hasOwnProperty.call(rawBody, key)) {
			const rawValue = rawBody[key];
			// For reasoning/thinking objects, track child keys instead of parent.
			// Example: reasoning:{effort:"high"} -> reasoning.effort
			if (canonical === "reasoning" && isPlainObject(rawValue)) {
				params.push(...getObjectChildParamPaths("reasoning", rawValue));
			} else {
				params.push(canonical);
			}
		}
	}

	// Normalize /responses text.format into canonical response_format parameter.
	if (endpoint === "responses" && rawBody.text?.format != null) {
		params.push("response_format");
	}

	// Infer tool usage from message/input surfaces where tools may be omitted but active.
	if (Array.isArray(rawBody.messages) && hasToolUsageInMessages(rawBody.messages)) {
		params.push("tools");
	}
	if (endpoint === "responses" && Array.isArray(rawBody.input_items) && hasToolUsageInResponsesInput(rawBody.input_items)) {
		params.push("tools");
	}
	if (endpoint === "responses" && Array.isArray(rawBody.input) && hasToolUsageInResponsesInput(rawBody.input)) {
		params.push("tools");
	}

	return normalizeParamPaths(params);
}

/**
 * Check if a provider supports a specific parameter.
 * Uses canonical + alias keys against provider capability metadata.
 */
export function providerSupportsParam(
	candidate: ProviderCandidate,
	paramPath: string,
	options?: { assumeSupportedOnMissingConfig?: boolean }
): boolean {
	const params = candidate.capabilityParams;
	if (!params || typeof params !== "object") {
		return options?.assumeSupportedOnMissingConfig ?? false;
	}
	if (Object.keys(params).length === 0) {
		return options?.assumeSupportedOnMissingConfig ?? false;
	}

	if (paramPath in params) return true;

	const segments = paramPath.split(".").filter(Boolean);
	const [root, ...rest] = segments;
	if (!root) return false;

	const keysToCheck = CAPABILITY_PARAM_ALIASES[root] ?? [root];
	for (const key of keysToCheck) {
		// Root-level declaration (e.g., "reasoning") supports all sub-fields.
		if (key in params) {
			if (rest.length === 0) return true;
			const rootValue = (params as Record<string, unknown>)[key];
			if (isPlainObject(rootValue) && hasNestedPath(rootValue, rest)) {
				return true;
			}
		}

		// Flattened declaration (e.g., "reasoning.effort")
		if (rest.length > 0 && `${key}.${rest.join(".")}` in params) {
			return true;
		}
	}
	return false;
}

export function guardProviderParams(args: {
	endpoint: Endpoint;
	rawBody: any;
	requestId: string;
	teamId: string;
	providers: ProviderCandidate[];
	betaEnabled: boolean;
}):
	| { ok: true; providers: ProviderCandidate[]; requestedParams: string[] }
	| { ok: false; response: Response } {
	if (!args.betaEnabled) {
		return { ok: true, providers: args.providers, requestedParams: [] };
	}

	const unknown = getUnknownTopLevelParams(args.endpoint, args.rawBody);
	if (unknown.length) {
		return {
			ok: false,
			response: err("validation_error", {
				details: unknown.map((param) => ({
					message: `Unknown parameter: ${param}`,
					path: [param],
					keyword: "unknown_param",
					params: { param },
				})),
				request_id: args.requestId,
				team_id: args.teamId,
			}),
		};
	}

	const requested = extractRequestedParams(args.endpoint, args.rawBody);
	if (!requested.length) {
		return { ok: true, providers: args.providers, requestedParams: [] };
	}

	const isAlwaysSupported = (param: string): boolean =>
		(args.endpoint === "messages" && param === "max_tokens") ||
		// `modalities` support is validated by modality-aware routing, not param capability keys.
		param === "modalities";

	const supportMap: Record<string, ProviderSupportInfo[]> = {};
	for (const param of requested) {
		supportMap[param] = args.providers.map((provider) => ({
			providerId: provider.providerId,
			supported:
				isAlwaysSupported(param) ||
				providerSupportsParam(provider, param, { assumeSupportedOnMissingConfig: false }),
		}));
	}

	const unsupportedParams = requested.filter((param) =>
		supportMap[param].every((info) => !info.supported)
	);

	if (unsupportedParams.length) {
		return {
			ok: false,
			response: err("validation_error", {
				details: unsupportedParams.map((param) => ({
					message: `Unsupported parameter: ${param}`,
					path: param.split("."),
					keyword: "unsupported_param",
					params: { param },
				})),
				request_id: args.requestId,
				team_id: args.teamId,
			}),
		};
	}

	const filtered = args.providers.filter((provider) =>
		requested.every(
			(param) =>
				isAlwaysSupported(param) ||
				providerSupportsParam(provider, param, { assumeSupportedOnMissingConfig: false }),
		),
	);

	if (!filtered.length) {
		return {
			ok: false,
			response: err("validation_error", {
				details: requested.map((param) => ({
					message: `No single provider supports parameter: ${param}`,
					path: param.split("."),
					keyword: "unsupported_param_combo",
					params: { param },
				})),
				request_id: args.requestId,
				team_id: args.teamId,
			}),
		};
	}

	return { ok: true, providers: filtered, requestedParams: requested };
}
