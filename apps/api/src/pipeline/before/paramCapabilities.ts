// Purpose: Pipeline module for parameter capability checks.
// Why: Keeps text-endpoint param extraction and provider support checks reusable.
// How: Uses code-first text param policy + provider capability metadata.

import type { Endpoint } from "@core/types";
import type { ProviderCandidate } from "./types";
import {
	expandCapabilityParamAliases,
	isAlwaysSupportedParam,
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
		if (Object.prototype.hasOwnProperty.call(rawBody, key)) {
			const rawValue = rawBody[key];
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
	const override = resolveProviderParamSupportOverride(
		candidate.providerId,
		paramPath,
	);
	if (typeof override === "boolean") {
		return override;
	}

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

	const keysToCheck = expandCapabilityParamAliases(root);
	for (const key of keysToCheck) {
		if (key in params) {
			if (rest.length === 0) return true;
			const rootValue = (params as Record<string, unknown>)[key];
			if (isPlainObject(rootValue) && hasNestedPath(rootValue, rest)) {
				return true;
			}
		}

		if (rest.length > 0 && `${key}.${rest.join(".")}` in params) {
			return true;
		}
	}
	return false;
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
			!providerSupportsParam(args.candidate, param, {
				assumeSupportedOnMissingConfig:
					args.assumeSupportedOnMissingConfig ?? false,
			})
		) {
			out.push(param);
		}
	}
	return out;
}
