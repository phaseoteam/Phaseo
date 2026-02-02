// Purpose: Pipeline module for capability-based validation and provider filtering.
// Why: Ensures requests are routed only to providers that support required capabilities.
// How: Validates token limits, parameter support, and filters incompatible providers.

import type { Endpoint } from "@core/types";
import type { ProviderCandidate } from "./types";
import { err } from "./http";
import { providerSupportsParam, extractRequestedParams } from "./paramCapabilities";
import {
	canProviderHandleReasoning,
	isReasoningRequested,
	extractReasoningFromBody,
} from "./reasoningNormalization";
import { isParamSupported, getResponseFormatConfig } from "./paramConfig";

type ValidationResult =
	| { ok: true; providers: ProviderCandidate[]; body: any }
	| { ok: false; response: Response };

/**
 * Gets the max_tokens value from the request body, checking both field names
 */
function getRequestedMaxTokens(body: any): number | null {
	if (typeof body?.max_tokens === "number" && body.max_tokens > 0) {
		return body.max_tokens;
	}
	if (typeof body?.max_output_tokens === "number" && body.max_output_tokens > 0) {
		return body.max_output_tokens;
	}
	return null;
}

/**
 * Validates that providers support all requested parameters
 */
function validateParameterSupport(args: {
	endpoint: Endpoint;
	rawBody: any;
	requestId: string;
	teamId: string;
	providers: ProviderCandidate[];
	model: string;
}): ValidationResult {
	const requested = extractRequestedParams(args.endpoint, args.rawBody);
	if (!requested.length) {
		return { ok: true, providers: args.providers, body: args.rawBody };
	}

	const isAlwaysSupported = (param: string): boolean =>
		args.endpoint === "messages" && param === "max_tokens";

	// Build support map for each parameter
	const supportMap: Record<string, { providerId: string; supported: boolean }[]> = {};
	for (const param of requested) {
		supportMap[param] = args.providers.map((provider) => ({
			providerId: provider.providerId,
			supported:
				isAlwaysSupported(param) ||
				providerSupportsParam(provider, param, { assumeSupportedOnMissingConfig: true }),
		}));
	}

	// Check if any parameter is unsupported by all providers
	const unsupportedParams = requested.filter((param) =>
		supportMap[param].every((info) => !info.supported)
	);

	if (unsupportedParams.length) {
		const details = unsupportedParams.map((param) => ({
			message: `Model "${args.model}" has no providers that support parameter: ${param}`,
			path: param.split("."),
			keyword: "unsupported_param",
			params: { param, model: args.model },
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

	// Filter to providers that support ALL requested parameters
	const filtered = args.providers.filter((provider) =>
		requested.every(
			(param) =>
				isAlwaysSupported(param) ||
				providerSupportsParam(provider, param, { assumeSupportedOnMissingConfig: true }),
		)
	);

	if (!filtered.length) {
		const paramsList = requested.join(", ");
		const details = [{
			message: `Model "${args.model}" has no providers that support all requested parameters: ${paramsList}`,
			path: ["parameters"],
			keyword: "unsupported_param_combo",
			params: { parameters: requested, model: args.model },
		}];
		return {
			ok: false,
			response: err("validation_error", {
				details,
				request_id: args.requestId,
				team_id: args.teamId,
			}),
		};
	}

	return { ok: true, providers: filtered, body: args.rawBody };
}

/**
 * Validates response_format parameter support
 */
function validateResponseFormat(args: {
	body: any;
	providers: ProviderCandidate[];
	requestId: string;
	teamId: string;
	model: string;
}): ValidationResult {
	const responseFormat = args.body.response_format;
	if (!responseFormat) {
		return { ok: true, providers: args.providers, body: args.body };
	}

	const formatType = typeof responseFormat === "string"
		? responseFormat
		: responseFormat.type;

	if (!formatType) {
		return { ok: true, providers: args.providers, body: args.body };
	}

	// Filter providers that support response_format
	const filtered = args.providers.filter((provider) => {
		const params = provider.capabilityParams;
		if (!isParamSupported(params, "response_format")) return false;

		// Check if specific format type is supported
		const formatConfig = getResponseFormatConfig(params);
		if (!formatConfig.types || formatConfig.types.length === 0) return true; // no restrictions
		return formatConfig.types.includes(formatType);
	});

	if (!filtered.length) {
		return {
			ok: false,
			response: err("validation_error", {
				details: [{
					message: `Model "${args.model}" has no providers that support response_format type: ${formatType}`,
					path: ["response_format", "type"],
					keyword: "unsupported_response_format",
					params: { formatType, model: args.model },
				}],
				request_id: args.requestId,
				team_id: args.teamId,
			}),
		};
	}

	return { ok: true, providers: filtered, body: args.body };
}

/**
 * Validates reasoning parameter support
 */
function validateReasoning(args: {
	body: any;
	providers: ProviderCandidate[];
	requestId: string;
	teamId: string;
	model: string;
}): ValidationResult {
	// Check if reasoning is requested
	if (!isReasoningRequested(args.body)) {
		return { ok: true, providers: args.providers, body: args.body };
	}

	// Extract reasoning configuration
	const reasoning = extractReasoningFromBody(args.body);
	if (!reasoning) {
		return { ok: true, providers: args.providers, body: args.body };
	}

	// Filter providers that can handle reasoning
	const filtered = args.providers.filter((provider) =>
		canProviderHandleReasoning(reasoning, provider)
	);

	if (!filtered.length) {
		const effortInfo = reasoning.effort ? ` (effort: ${reasoning.effort})` : "";
		const tokensInfo = reasoning.maxTokens ? ` (max_tokens: ${reasoning.maxTokens})` : "";

		return {
			ok: false,
			response: err("validation_error", {
				details: [{
					message: `Model "${args.model}" has no providers that support reasoning${effortInfo}${tokensInfo}`,
					path: ["reasoning"],
					keyword: "unsupported_reasoning",
					params: { reasoning, model: args.model },
				}],
				request_id: args.requestId,
				team_id: args.teamId,
			}),
		};
	}

	return { ok: true, providers: filtered, body: args.body };
}

/**
 * Filters providers based on max_tokens requirements
 * If max_tokens is provided, only include providers that can accommodate it
 */
function filterProvidersByTokenLimits(args: {
	body: any;
	providers: ProviderCandidate[];
	requestId: string;
	teamId: string;
	model: string;
}): ValidationResult {
	const requestedMaxTokens = getRequestedMaxTokens(args.body);

	// If no max_tokens specified, pass all providers through
	if (requestedMaxTokens === null) {
		return { ok: true, providers: args.providers, body: args.body };
	}

	// Filter providers that can accommodate this token limit
	const filtered = args.providers.filter((provider) => {
		// If provider has no limit specified, assume it can handle the request
		if (provider.maxOutputTokens === null || provider.maxOutputTokens === undefined) {
			return true;
		}
		// Provider must support at least the requested amount
		return provider.maxOutputTokens >= requestedMaxTokens;
	});

	if (!filtered.length) {
		return {
			ok: false,
			response: err("validation_error", {
				details: [{
					message: `Model "${args.model}" has no providers that support max_tokens of ${requestedMaxTokens} (exceeds all available provider limits)`,
					path: ["max_tokens"],
					keyword: "max_tokens_exceeded",
					params: { requested: requestedMaxTokens, model: args.model },
				}],
				request_id: args.requestId,
				team_id: args.teamId,
			}),
		};
	}

	return { ok: true, providers: filtered, body: args.body };
}

/**
 * Validates structured_outputs support
 */
function validateStructuredOutputs(args: {
	body: any;
	providers: ProviderCandidate[];
	requestId: string;
	teamId: string;
	model: string;
}): ValidationResult {
	// Check if structured outputs requested
	const hasStructuredOutputs =
		args.body.structured_outputs === true ||
		(args.body.response_format?.type === "json_schema" && args.body.response_format?.strict === true);

	if (!hasStructuredOutputs) {
		return { ok: true, providers: args.providers, body: args.body };
	}

	// Filter providers that support structured outputs
	const filtered = args.providers.filter((provider) => {
		const params = provider.capabilityParams;
		const formatConfig = getResponseFormatConfig(params);
		return formatConfig.supported && formatConfig.structuredOutputs === true;
	});

	if (!filtered.length) {
		return {
			ok: false,
			response: err("validation_error", {
				details: [{
					message: `Model "${args.model}" has no providers that support structured outputs (strict JSON schemas)`,
					path: ["response_format", "strict"],
					keyword: "unsupported_structured_outputs",
					params: { model: args.model },
				}],
				request_id: args.requestId,
				team_id: args.teamId,
			}),
		};
	}

	return { ok: true, providers: filtered, body: args.body };
}

/**
 * Main entry point for capability-based validation
 * Validates parameter support and token limits, filters providers accordingly
 */
export function validateCapabilities(args: {
	endpoint: Endpoint;
	rawBody: any;
	body: any;
	requestId: string;
	teamId: string;
	providers: ProviderCandidate[];
	model: string;
}): ValidationResult {
	// Step 1: Basic parameter support (always active)
	const paramResult = validateParameterSupport({
		endpoint: args.endpoint,
		rawBody: args.rawBody,
		requestId: args.requestId,
		teamId: args.teamId,
		providers: args.providers,
		model: args.model,
	});
	if (!paramResult.ok) return paramResult;

	// Step 2: Response format validation
	const formatResult = validateResponseFormat({
		body: args.body,
		providers: paramResult.providers,
		requestId: args.requestId,
		teamId: args.teamId,
		model: args.model,
	});
	if (!formatResult.ok) return formatResult;

	// Step 3: Structured outputs validation
	const structuredResult = validateStructuredOutputs({
		body: args.body,
		providers: formatResult.providers,
		requestId: args.requestId,
		teamId: args.teamId,
		model: args.model,
	});
	if (!structuredResult.ok) return structuredResult;

	// Step 4: Reasoning validation
	const reasoningResult = validateReasoning({
		body: args.body,
		providers: structuredResult.providers,
		requestId: args.requestId,
		teamId: args.teamId,
		model: args.model,
	});
	if (!reasoningResult.ok) return reasoningResult;

	// Step 5: Token limits (if max_tokens is provided)
	const tokenResult = filterProvidersByTokenLimits({
		body: args.body,
		providers: reasoningResult.providers,
		requestId: args.requestId,
		teamId: args.teamId,
		model: args.model,
	});
	if (!tokenResult.ok) return tokenResult;

	// Return filtered providers (body unchanged)
	return { ok: true, providers: tokenResult.providers, body: args.body };
}
