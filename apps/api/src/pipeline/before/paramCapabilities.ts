// Purpose: Pipeline module for the gateway request lifecycle.
// Why: Keeps parameter capability checks centralized and reusable.
// How: Extracts requested params and optionally filters providers in beta mode.

import type { Endpoint } from "@core/types";
import type { ProviderCandidate } from "./types";
import { err } from "./http";

type ProviderSupportInfo = {
	providerId: string;
	supported: boolean;
};

function hasOwn(obj: any, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(obj, key);
}

function normalizeParamPaths(paths: string[]): string[] {
	const unique = new Set<string>();
	for (const p of paths) {
		if (typeof p === "string" && p.trim().length) unique.add(p);
	}
	return Array.from(unique);
}

export function extractRequestedParams(endpoint: Endpoint, rawBody: any): string[] {
	if (!rawBody || typeof rawBody !== "object") return [];
	const params: string[] = [];

	const add = (name: string, condition = true) => {
		if (condition) params.push(name);
	};

	const hasToolUsageInMessages = (messages: any[]): boolean =>
		messages.some((msg) =>
			msg &&
			(typeof msg.tool_call_id === "string" ||
				msg.role === "tool" ||
				(Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0))
		);

	const hasToolUsageInResponsesInput = (items: any[]): boolean =>
		items.some((item) =>
			item &&
			(item.type === "function_call" ||
				item.type === "function_call_output" ||
				item.tool_call_id ||
				item.call_id)
		);

	switch (endpoint) {
		case "chat.completions": {
			if (hasOwn(rawBody, "tools") && Array.isArray(rawBody.tools) && rawBody.tools.length > 0) add("tools");
			if (Array.isArray(rawBody.messages) && hasToolUsageInMessages(rawBody.messages)) add("tools");
			if (hasOwn(rawBody, "tool_choice")) add("tool_choice");
			if (hasOwn(rawBody, "parallel_tool_calls")) add("parallel_tool_calls");
			if (hasOwn(rawBody, "max_tool_calls")) add("max_tool_calls");
			if (hasOwn(rawBody, "temperature")) add("temperature");
			if (hasOwn(rawBody, "top_p")) add("top_p");
			if (hasOwn(rawBody, "top_k")) add("top_k");
			if (hasOwn(rawBody, "max_tokens") || hasOwn(rawBody, "max_output_tokens")) add("max_tokens");
			if (hasOwn(rawBody, "stop")) add("stop");
			if (hasOwn(rawBody, "logit_bias")) add("logit_bias");
			if (hasOwn(rawBody, "seed")) add("seed");
			if (hasOwn(rawBody, "response_format")) add("response_format");
			if (hasOwn(rawBody, "modalities")) add("modalities");
			if (hasOwn(rawBody, "logprobs")) add("logprobs");
			if (hasOwn(rawBody, "top_logprobs")) add("top_logprobs");
			if (hasOwn(rawBody, "presence_penalty")) add("presence_penalty");
			if (hasOwn(rawBody, "frequency_penalty")) add("frequency_penalty");
			break;
		}
		case "responses": {
			if (hasOwn(rawBody, "tools") && Array.isArray(rawBody.tools) && rawBody.tools.length > 0) add("tools");
			if (Array.isArray(rawBody.messages) && hasToolUsageInMessages(rawBody.messages)) add("tools");
			if (Array.isArray(rawBody.input_items) && hasToolUsageInResponsesInput(rawBody.input_items)) add("tools");
			if (Array.isArray(rawBody.input) && hasToolUsageInResponsesInput(rawBody.input)) add("tools");
			if (hasOwn(rawBody, "tool_choice")) add("tool_choice");
			if (hasOwn(rawBody, "parallel_tool_calls")) add("parallel_tool_calls");
			if (hasOwn(rawBody, "max_tool_calls")) add("max_tool_calls");
			if (hasOwn(rawBody, "temperature")) add("temperature");
			if (hasOwn(rawBody, "top_p")) add("top_p");
			if (hasOwn(rawBody, "top_k")) add("top_k");
			if (hasOwn(rawBody, "max_output_tokens") || hasOwn(rawBody, "max_tokens")) add("max_tokens");
			if (hasOwn(rawBody, "stop")) add("stop");
			if (hasOwn(rawBody, "logit_bias")) add("logit_bias");
			if (hasOwn(rawBody, "seed")) add("seed");
			if (hasOwn(rawBody, "response_format")) add("response_format");
			if (hasOwn(rawBody, "text") && rawBody.text?.format) add("response_format");
			if (hasOwn(rawBody, "modalities")) add("modalities");
			if (hasOwn(rawBody, "logprobs") || hasOwn(rawBody, "top_logprobs")) add("logprobs");
			if (hasOwn(rawBody, "presence_penalty")) add("presence_penalty");
			if (hasOwn(rawBody, "frequency_penalty")) add("frequency_penalty");
			break;
		}
		case "messages": {
			if (hasOwn(rawBody, "tools") && Array.isArray(rawBody.tools) && rawBody.tools.length > 0) add("tools");
			if (hasOwn(rawBody, "tool_choice")) add("tool_choice");
			if (hasOwn(rawBody, "max_tokens") || hasOwn(rawBody, "max_output_tokens")) add("max_tokens");
			if (hasOwn(rawBody, "temperature")) add("temperature");
			if (hasOwn(rawBody, "top_p")) add("top_p");
			if (hasOwn(rawBody, "top_k")) add("top_k");
			if (hasOwn(rawBody, "stop_sequences")) add("stop_sequences");
			if (hasOwn(rawBody, "modalities")) add("modalities");
			break;
		}
		default:
			break;
	}

	return normalizeParamPaths(params);
}

/**
 * Check if a provider supports a specific parameter
 * Simple rule: if the parameter key exists in capabilityParams, it's supported
 */
export function providerSupportsParam(
	candidate: ProviderCandidate,
	paramPath: string,
	options?: { assumeSupportedOnMissingConfig?: boolean }
): boolean {
	const params = candidate.capabilityParams;

	// No config at all - assume supported if option is set
	if (!params || typeof params !== "object") {
		return options?.assumeSupportedOnMissingConfig ?? false;
	}

	// Check if parameter exists (simple key check)
	// Handle nested paths like "reasoning.effort" -> check "reasoning" key
	const [root] = paramPath.split(".", 2);
	return root in params;
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

	const requested = extractRequestedParams(args.endpoint, args.rawBody);
	if (!requested.length) {
		return { ok: true, providers: args.providers, requestedParams: [] };
	}

	const isAlwaysSupported = (param: string): boolean =>
		args.endpoint === "messages" && param === "max_tokens";

	const supportMap: Record<string, ProviderSupportInfo[]> = {};
	for (const param of requested) {
		supportMap[param] = args.providers.map((provider) => ({
			providerId: provider.providerId,
			supported:
				isAlwaysSupported(param) ||
				providerSupportsParam(provider, param, { assumeSupportedOnMissingConfig: true }),
		}));
	}

	const unsupportedParams = requested.filter((param) =>
		supportMap[param].every((info) => !info.supported)
	);

	if (unsupportedParams.length) {
		const details = unsupportedParams.map((param) => ({
			message: `Unsupported parameter: ${param}`,
			path: param.split("."),
			keyword: "unsupported_param",
			params: {
				param,
			},
		}));
		return {
			ok: false,
			response: err("validation_error", {
				details,
				request_id: args.requestId,
				team_id: args.teamId,
			}),
		};
	}

	const filtered = args.providers.filter((provider) =>
		requested.every(
			(param) =>
				isAlwaysSupported(param) ||
				providerSupportsParam(provider, param, { assumeSupportedOnMissingConfig: true }),
		),
	);

	if (!filtered.length) {
		const details = requested.map((param) => ({
			message: `No single provider supports parameter: ${param}`,
			path: param.split("."),
			keyword: "unsupported_param_combo",
			params: {
				param,
			},
		}));
		return {
			ok: false,
			response: err("validation_error", {
				details,
				request_id: args.requestId,
				team_id: args.teamId,
			}),
		};
	}

	return { ok: true, providers: filtered, requestedParams: requested };
}
