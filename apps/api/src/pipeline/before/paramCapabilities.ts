// Purpose: Pipeline module for parameter capability checks.
// Why: Keeps text-endpoint param extraction and provider support checks reusable.
// How: Uses code-first text param policy + provider capability metadata.

import type { Endpoint } from "@core/types";
import { isNativeWebSearchTool, isNativeWebSearchToolType, isOpenAINativeWebSearchTool } from "@core/nativeTools";
import type { ProviderCandidate } from "./types";
import {
	expandCapabilityParamAliases,
	isAlwaysSupportedParam,
	isDroppableHintParam,
	resolveProviderParamSupportOverride,
	textEndpointRegistryFor,
} from "./textParamPolicy";

function normalizeParamPaths(paths: string[]): string[] {
	const unique = new Set<string>();
	for (const path of paths) {
		if (typeof path === "string" && path.trim().length > 0) {
			unique.add(path);
		}
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

function hasNativeWebSearchToolUsage(tools: unknown, toolChoice: unknown): boolean {
	const hasTool = Array.isArray(tools) && tools.some((tool) => isNativeWebSearchTool(tool));
	if (hasTool) return true;

	if (typeof toolChoice === "string") {
		return isNativeWebSearchToolType(toolChoice.trim());
	}

	if (!toolChoice || typeof toolChoice !== "object") return false;
	const value = toolChoice as Record<string, unknown>;
	return (
		isNativeWebSearchToolType(value.type) ||
		isNativeWebSearchToolType(value.name) ||
		isNativeWebSearchToolType((value.function as Record<string, unknown> | undefined)?.name)
	);
}

/**
 * Requested params the gateway can satisfy on a provider without native
 * support, so `require_parameters` must not exclude providers for them. An
 * OpenAI hosted web search tool asks for native search (`web_search_options`)
 * where the provider has it; elsewhere it runs as the gateway's own
 * phaseo:web_search (see ./hostedTools.ts). An explicit top-level
 * `web_search_options` stays a real requirement.
 */
export function getGatewayFallbackParams(endpoint: Endpoint, rawBody: any): string[] {
	if ((endpoint !== "chat.completions" && endpoint !== "responses") || !isPlainObject(rawBody)) return [];
	if (rawBody.web_search_options != null || rawBody.webSearchOptions != null) return [];
	const hasHostedWebSearch = Array.isArray(rawBody.tools)
		&& rawBody.tools.some((tool: unknown) => isOpenAINativeWebSearchTool(tool));
	return hasHostedWebSearch ? ["web_search_options"] : [];
}

export function getUnknownTopLevelParams(endpoint: Endpoint, rawBody: any): string[] {
	if (!rawBody || typeof rawBody !== "object") return [];
	const registry = textEndpointRegistryFor(endpoint);
	if (!registry) return [];
	return Object.keys(rawBody).filter((key) => !registry.allowedTopLevel.has(key));
}

export function extractRequestedParams(endpoint: Endpoint, rawBody: any): string[] {
	if (!rawBody || typeof rawBody !== "object") return [];
	const registry = textEndpointRegistryFor(endpoint);
	if (!registry) return [];

	const params: string[] = [];
	for (const [key, canonical] of Object.entries(registry.keyToCanonicalParam)) {
		// Cache and identity hints are best effort and never constrain routing.
		if (isDroppableHintParam(canonical)) continue;
		if (Object.prototype.hasOwnProperty.call(rawBody, key)) {
			const rawValue = rawBody[key];
			if (canonical === "provider_options") {
				if (!isPlainObject(rawValue)) continue;
				const hasAnyProviderOptions = Object.values(rawValue).some(
					(value) => value !== undefined && value !== null,
				);
				if (!hasAnyProviderOptions) continue;
				const hasContextManagement =
					hasNestedPath(rawValue, ["openai", "context_management"]) ||
					hasNestedPath(rawValue, ["openai", "contextManagement"]);
				if (hasContextManagement) {
					params.push("provider_options.openai.context_management");
				} else {
					params.push(canonical);
				}
				continue;
			}
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
	// Anthropic's output_config carries reasoning effort and structured output; route on both.
	if (endpoint === "messages" && isPlainObject(rawBody.output_config)) {
		if (rawBody.output_config.effort != null) params.push("reasoning.effort");
		if (rawBody.output_config.format != null) params.push("response_format");
	}

	// Infer tool usage from message/input surfaces where tools may be omitted but active.
	if (Array.isArray(rawBody.messages) && hasToolUsageInMessages(rawBody.messages)) {
		params.push("tools");
	}
	if (
		endpoint === "responses" &&
		Array.isArray(rawBody.input_items) &&
		hasToolUsageInResponsesInput(rawBody.input_items)
	) {
		params.push("tools");
	}
	if (
		endpoint === "responses" &&
		Array.isArray(rawBody.input) &&
		hasToolUsageInResponsesInput(rawBody.input)
	) {
		params.push("tools");
	}
	if (hasNativeWebSearchToolUsage(rawBody.tools, rawBody.tool_choice)) {
		params.push("web_search_options");
	}

	return normalizeParamPaths(params);
}

/**
 * Check if a provider supports a specific parameter.
 * Uses code-level overrides first, then falls back to capability metadata.
 */
export function providerSupportsParam(
	candidate: ProviderCandidate,
	paramPath: string,
	options?: { assumeSupportedOnMissingConfig?: boolean },
): boolean {
	return providerParamSupportStatus(candidate, paramPath, options) === "supported";
}

export type ProviderParamSupportStatus = "supported" | "unsupported" | "unknown";

/**
 * Resolve provider parameter support without conflating missing catalog data
 * with an explicit provider limitation. Unknown support remains eligible for
 * optimistic routing; explicit false overrides remain hard exclusions.
 */
export function providerParamSupportStatus(
	candidate: ProviderCandidate,
	paramPath: string,
	options?: { assumeSupportedOnMissingConfig?: boolean },
): ProviderParamSupportStatus {
	// provider_options is explicitly scoped to a provider. A provider that is
	// not named by the request must never receive another provider's options,
	// even when its capability metadata is incomplete.
	const providerOptionsMatch = /^provider_options\.([^\.]+)(?:\.|$)/.exec(paramPath);
	if (providerOptionsMatch && providerOptionsMatch[1] !== candidate.providerId) {
		return "unsupported";
	}

	const override = resolveProviderParamSupportOverride(
		candidate.providerId,
		paramPath,
	);
	if (override === true) return "supported";
	if (override === false) return "unsupported";

	const params = candidate.capabilityParams;
	if (!params || typeof params !== "object") {
		return options?.assumeSupportedOnMissingConfig ? "supported" : "unknown";
	}
	if (Object.keys(params).length === 0) {
		return options?.assumeSupportedOnMissingConfig ? "supported" : "unknown";
	}

	if (paramPath in params) return "supported";

	const segments = paramPath.split(".").filter(Boolean);
	const [root, ...rest] = segments;
	if (!root) return "unknown";

	const keysToCheck = expandCapabilityParamAliases(root);
	for (const key of keysToCheck) {
		if (key in params) {
			if (rest.length === 0) return "supported";
			const rootValue = (params as Record<string, unknown>)[key];
			if (isPlainObject(rootValue) && hasNestedPath(rootValue, rest)) {
				return "supported";
			}
		}

		if (rest.length > 0 && `${key}.${rest.join(".")}` in params) {
			return "supported";
		}
	}
	return "unknown";
}

export function getUnsupportedParamsForProvider(args: {
	endpoint: Endpoint;
	requestedParams: string[];
	candidate: ProviderCandidate;
	assumeSupportedOnMissingConfig?: boolean;
}): string[] {
	const out: string[] = [];
	for (const param of args.requestedParams) {
		if (isAlwaysSupportedParam(args.endpoint, param)) continue;
		if (
			providerParamSupportStatus(args.candidate, param, {
				assumeSupportedOnMissingConfig:
					args.assumeSupportedOnMissingConfig ?? false,
			})
				=== "unsupported"
		) {
			out.push(param);
		}
	}
	return out;
}
