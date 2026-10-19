// Purpose: Pipeline module for capability-based validation and provider filtering.
// Why: Ensures requests are routed only to providers that support required capabilities.
// How: Validates token limits, parameter support, and filters incompatible providers.

import type { Endpoint } from "@core/types";
import { routeOutputTokenLimit } from "@core/route-token-limits";
import type { ParamRoutingDiagnostics, ProviderCandidate } from "./types";
import { err } from "./http";
import {
	providerParamSupportStatus,
	extractRequestedParams,
	getUnknownTopLevelParams,
} from "./paramCapabilities";
import { isAlwaysSupportedParam } from "./textParamPolicy";
import { validateProviderDocsCompliance } from "./providerDocsValidation";
import { getEffectiveRoutingHints } from "../requestRouting";

type ValidationResult =
	| {
		ok: true;
		providers: ProviderCandidate[];
		body: any;
		requestedParams: string[];
		paramRoutingDiagnostics: ParamRoutingDiagnostics;
	}
	| { ok: false; response: Response };

type StageValidationResult =
	| { ok: true; providers: ProviderCandidate[]; body: any }
	| { ok: false; response: Response };

type ProviderSupportInfo = {
	providerId: string;
	status: "supported" | "unsupported" | "unknown";
};

type ParameterSupportResult =
	| {
		ok: true;
		providers: ProviderCandidate[];
		body: any;
		requestedParams: string[];
		supportMap: Record<string, ProviderSupportInfo[]>;
	}
	| { ok: false; response: Response };

type FilteringStage = ParamRoutingDiagnostics["filteringStages"][number]["stage"];

function uniqueProviderIds(providers: ProviderCandidate[]): string[] {
	const seen = new Set<string>();
	const ids: string[] = [];
	for (const provider of providers) {
		if (!provider?.providerId || seen.has(provider.providerId)) continue;
		seen.add(provider.providerId);
		ids.push(provider.providerId);
	}
	return ids;
}

function buildDroppedProviders(args: {
	initialProviders: ProviderCandidate[];
	finalProviders: ProviderCandidate[];
	requestedParams: string[];
	supportMap: Record<string, ProviderSupportInfo[]>;
}): ParamRoutingDiagnostics["droppedProviders"] {
	const finalSet = new Set(uniqueProviderIds(args.finalProviders));
	const uniqueInitial = uniqueProviderIds(args.initialProviders);
	return uniqueInitial
		.filter((providerId) => !finalSet.has(providerId))
		.map((providerId) => {
			const unsupportedParams = args.requestedParams.filter((param) => {
				const supportRow = args.supportMap[param] ?? [];
				const info = supportRow.find((entry) => entry.providerId === providerId);
				return info?.status === "unsupported";
			});
			return { providerId, unsupportedParams };
		});
}

function buildPerParamSupport(
	supportMap: Record<string, ProviderSupportInfo[]>
): ParamRoutingDiagnostics["perParamSupport"] {
	return Object.entries(supportMap).map(([param, supportRows]) => ({
		param,
		supportedProviders: supportRows
			.filter((entry) => entry.status === "supported")
			.map((entry) => entry.providerId),
		unsupportedProviders: supportRows
			.filter((entry) => entry.status === "unsupported")
			.map((entry) => entry.providerId),
		unknownProviders: supportRows
			.filter((entry) => entry.status === "unknown")
			.map((entry) => entry.providerId),
	}));
}

function pushFilteringStage(
	stages: ParamRoutingDiagnostics["filteringStages"],
	stage: FilteringStage,
	beforeProviders: ProviderCandidate[],
	afterProviders: ProviderCandidate[]
) {
	const beforeIds = uniqueProviderIds(beforeProviders);
	const afterIds = uniqueProviderIds(afterProviders);
	const afterSet = new Set(afterIds);
	stages.push({
		stage,
		beforeCount: beforeIds.length,
		afterCount: afterIds.length,
		droppedProviders: beforeIds.filter((id) => !afterSet.has(id)),
	});
}

function preferProvidersByRequestedParams(args: {
	providers: ProviderCandidate[];
	requestedParams: string[];
	supportMap: Record<string, ProviderSupportInfo[]>;
}): ProviderCandidate[] {
	if (args.providers.length <= 1 || args.requestedParams.length === 0) {
		return args.providers;
	}

	const unsupportedCountByProvider = new Map<string, number>();
	for (const provider of args.providers) {
		let unsupported = 0;
		for (const param of args.requestedParams) {
			const rows = args.supportMap[param] ?? [];
			const support = rows.find((row) => row.providerId === provider.providerId);
			if (support?.status === "unsupported") unsupported += 1;
		}
		unsupportedCountByProvider.set(provider.providerId, unsupported);
	}

	let minUnsupported = Number.POSITIVE_INFINITY;
	for (const count of unsupportedCountByProvider.values()) {
		if (count < minUnsupported) minUnsupported = count;
	}
	if (!Number.isFinite(minUnsupported)) return args.providers;

	// If nobody supports any requested params, keep the full pool.
	if (minUnsupported >= args.requestedParams.length) {
		return args.providers;
	}

	const preferred = args.providers.filter(
		(provider) =>
			(unsupportedCountByProvider.get(provider.providerId) ?? Number.POSITIVE_INFINITY) ===
			minUnsupported,
	);
	return preferred.length > 0 ? preferred : args.providers;
}

function filterProvidersForRequiredParams(args: {
	endpoint: Endpoint;
	providers: ProviderCandidate[];
	requestedParams: string[];
	supportMap: Record<string, ProviderSupportInfo[]>;
}): ProviderCandidate[] {
	if (args.requestedParams.length === 0) return args.providers;
	return args.providers.filter((provider) =>
		args.requestedParams.every((param) => {
			if (isAlwaysSupportedParam(args.endpoint, param)) return true;
			const rows = args.supportMap[param] ?? [];
			const match = rows.find((row) => row.providerId === provider.providerId);
			return match?.status !== "unsupported";
		}),
	);
}

function isJsonSchemaResponseFormat(body: any): boolean {
	const directFormat = body?.response_format;
	if (directFormat && typeof directFormat === "object" && directFormat.type === "json_schema") {
		return true;
	}
	// Responses text.format, or Anthropic Messages output_config.format (json_schema only).
	const textFormat = body?.text?.format ?? body?.output_config?.format;
	return Boolean(textFormat && typeof textFormat === "object" && textFormat.type === "json_schema");
}

function hasRequestedResponseFormat(body: any): boolean {
	return body?.response_format != null || body?.text?.format != null || body?.output_config?.format != null;
}

function filterProvidersByCapability(
	providers: ProviderCandidate[],
	paramPath: string,
): ProviderCandidate[] {
	return providers.filter(
		(provider) =>
			providerParamSupportStatus(provider, paramPath, {
				assumeSupportedOnMissingConfig: false,
			}) !== "unsupported",
	);
}

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
 * Responses state parameters that cannot work through the gateway: OpenAI,
 * Azure and xAI requests are forced to `store: false`, and a follow-up may be
 * routed to a different provider, so the referenced state never exists there.
 */
function getUnsupportedStatefulResponsesParams(endpoint: Endpoint, rawBody: any): string[] {
	if (endpoint !== "responses" || !rawBody || typeof rawBody !== "object") return [];
	return ["previous_response_id", "conversation"].filter((param) => {
		const value = rawBody[param];
		return value !== undefined && value !== null && value !== "";
	});
}

/**
 * Validates that providers support all requested parameters
 */
function validateParameterSupport(args: {
	endpoint: Endpoint;
	rawBody: any;
	body: any;
	requestId: string;
	workspaceId: string;
	providers: ProviderCandidate[];
	model: string;
	requiredParams?: string[];
}): ParameterSupportResult {
	const unknownParams = getUnknownTopLevelParams(args.endpoint, args.rawBody);
	if (unknownParams.length > 0) {
		const details = unknownParams.map((param) => ({
			message: `Unknown parameter: ${param}`,
			path: [param],
			keyword: "unknown_param",
			params: { param, model: args.model },
		}));
		return {
			ok: false,
			response: err("validation_error", {
				details,
				request_id: args.requestId,
				workspace_id: args.workspaceId,
			}),
		};
	}

	const statefulParams = getUnsupportedStatefulResponsesParams(args.endpoint, args.rawBody);
	if (statefulParams.length > 0) {
		return {
			ok: false,
			response: err("validation_error", {
				details: statefulParams.map((param) => ({
					message: `${param} is not supported: the gateway does not store responses (requests are sent with store=false and may be routed to any provider), so there is no earlier response or conversation to continue. Send the full conversation in input instead.`,
					path: [param],
					keyword: "unsupported_param",
					params: { param, model: args.model },
				})),
				request_id: args.requestId,
				workspace_id: args.workspaceId,
			}),
		};
	}

	const requested = Array.from(new Set([
		...extractRequestedParams(args.endpoint, args.rawBody),
		...(args.requiredParams ?? []),
	]));
	if (!requested.length) {
		return {
			ok: true,
			providers: args.providers,
			body: args.body,
			requestedParams: [],
			supportMap: {},
		};
	}

	// Build support map for each parameter
	const supportMap: Record<string, ProviderSupportInfo[]> = {};
	for (const param of requested) {
		supportMap[param] = args.providers.map((provider) => ({
			providerId: provider.providerId,
			status: isAlwaysSupportedParam(args.endpoint, param)
				? "supported"
				: providerParamSupportStatus(provider, param, {
					assumeSupportedOnMissingConfig: false,
				}),
		}));
	}

	const requireParameters = getEffectiveRoutingHints(args.body).requireParameters;
	return {
		ok: true,
		providers: requireParameters
			? filterProvidersForRequiredParams({
				endpoint: args.endpoint,
				providers: args.providers,
				requestedParams: requested,
				supportMap,
			})
			: args.providers,
		body: args.body,
		requestedParams: requested,
		supportMap,
	};
}

/**
 * Validates response_format parameter support
 */
function validateResponseFormat(args: {
	body: any;
	providers: ProviderCandidate[];
	requestId: string;
	workspaceId: string;
	model: string;
}): StageValidationResult {
	if (!hasRequestedResponseFormat(args.body)) {
		return { ok: true, providers: args.providers, body: args.body };
	}

	const filtered = filterProvidersByCapability(args.providers, "response_format");
	if (filtered.length > 0) {
		return { ok: true, providers: filtered, body: args.body };
	}

	return {
		ok: false,
		response: err("validation_error", {
			details: [{
				message: `Model "${args.model}" has no providers that support the requested response_format.`,
				path: ["response_format"],
				keyword: "response_format_unsupported",
				params: { model: args.model },
			}],
			request_id: args.requestId,
			workspace_id: args.workspaceId,
		}),
	};
}

/**
 * Filters providers based on max_tokens requirements
 * If max_tokens is provided, only include providers that can accommodate it
 */
function filterProvidersByTokenLimits(args: {
	body: any;
	providers: ProviderCandidate[];
	requestId: string;
	workspaceId: string;
	model: string;
}): StageValidationResult {
	const requestedMaxTokens = getRequestedMaxTokens(args.body);

	// If no max_tokens specified, pass all providers through
	if (requestedMaxTokens === null) {
		return { ok: true, providers: args.providers, body: args.body };
	}

	// Filter providers that can accommodate this token limit
	const filtered = args.providers.filter((provider) => {
		// No known limit (null, or a stored 0): assume it can handle the request.
		const limit = routeOutputTokenLimit(provider.maxOutputTokens);
		if (limit === null) {
			return true;
		}
		// Provider must support at least the requested amount
		return limit >= requestedMaxTokens;
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
				workspace_id: args.workspaceId,
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
	workspaceId: string;
	model: string;
}): StageValidationResult {
	if (!isJsonSchemaResponseFormat(args.body)) {
		return { ok: true, providers: args.providers, body: args.body };
	}

	const filtered = filterProvidersByCapability(args.providers, "structured_outputs");
	if (filtered.length > 0) {
		return { ok: true, providers: filtered, body: args.body };
	}

	return {
		ok: false,
		response: err("validation_error", {
			details: [{
				message: `Model "${args.model}" has no providers that support structured outputs for the requested JSON schema response format.`,
				path: ["response_format"],
				keyword: "structured_outputs_unsupported",
				params: { model: args.model },
			}],
			request_id: args.requestId,
			workspace_id: args.workspaceId,
		}),
	};
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
	workspaceId: string;
	providers: ProviderCandidate[];
	model: string;
	requiredParams?: string[];
}): ValidationResult {
	const filteringStages: ParamRoutingDiagnostics["filteringStages"] = [];
	const initialProviders = args.providers;

	// Step 1: Basic parameter support (always active)
	const paramResult = validateParameterSupport({
		endpoint: args.endpoint,
		rawBody: args.rawBody,
		body: args.body,
		requestId: args.requestId,
		workspaceId: args.workspaceId,
		providers: args.providers,
		model: args.model,
		requiredParams: args.requiredParams,
	});
	if ("response" in paramResult) return { ok: false, response: paramResult.response };
	pushFilteringStage(filteringStages, "param_support", initialProviders, paramResult.providers);

	if (paramResult.providers.length === 0) {
		return {
			ok: false,
			response: err("validation_error", {
				details: [{
					message: `Model "${args.model}" has no providers that support all requested parameters.`,
					path: ["provider", "require_parameters"],
					keyword: "require_parameters_unsatisfied",
					params: {
						model: args.model,
						requested_params: paramResult.requestedParams,
					},
				}],
				request_id: args.requestId,
				workspace_id: args.workspaceId,
			}),
		};
	}

	const preferredProviders = preferProvidersByRequestedParams({
		providers: paramResult.providers,
		requestedParams: paramResult.requestedParams,
		supportMap: paramResult.supportMap,
	});
	pushFilteringStage(
		filteringStages,
		"param_preference",
		paramResult.providers,
		preferredProviders,
	);

	// Step 1.5: Provider docs validation (hard constraints from provider API docs)
	const docsResult = validateProviderDocsCompliance({
		endpoint: args.endpoint,
		body: paramResult.body,
		requestId: args.requestId,
		workspaceId: args.workspaceId,
		model: args.model,
		providers: preferredProviders,
		requestedParams: paramResult.requestedParams,
	});
	if ("response" in docsResult) return { ok: false, response: docsResult.response };
	pushFilteringStage(filteringStages, "provider_docs", preferredProviders, docsResult.providers);

	// Step 2: Response format validation
	const formatResult = validateResponseFormat({
		body: docsResult.body,
		providers: docsResult.providers,
		requestId: args.requestId,
		workspaceId: args.workspaceId,
		model: args.model,
	});
	if ("response" in formatResult) return { ok: false, response: formatResult.response };
	pushFilteringStage(filteringStages, "response_format", docsResult.providers, formatResult.providers);

	// Step 3: Structured outputs validation
	const structuredResult = validateStructuredOutputs({
		body: formatResult.body,
		providers: formatResult.providers,
		requestId: args.requestId,
		workspaceId: args.workspaceId,
		model: args.model,
	});
	if ("response" in structuredResult) return { ok: false, response: structuredResult.response };
	pushFilteringStage(filteringStages, "structured_outputs", formatResult.providers, structuredResult.providers);

	// Step 4: Token limits (if max_tokens is provided)
	const tokenResult = filterProvidersByTokenLimits({
		body: structuredResult.body,
		providers: structuredResult.providers,
		requestId: args.requestId,
		workspaceId: args.workspaceId,
		model: args.model,
	});
	if ("response" in tokenResult) return { ok: false, response: tokenResult.response };
	pushFilteringStage(filteringStages, "token_limits", structuredResult.providers, tokenResult.providers);

	const requestedParams = paramResult.requestedParams;
	const diagnostics: ParamRoutingDiagnostics = {
		requestedParams,
		unknownParams: [],
		providerCountBefore: uniqueProviderIds(initialProviders).length,
		providerCountAfter: uniqueProviderIds(tokenResult.providers).length,
		perParamSupport: buildPerParamSupport(paramResult.supportMap),
		droppedProviders: buildDroppedProviders({
			initialProviders,
			finalProviders: tokenResult.providers,
			requestedParams,
			supportMap: paramResult.supportMap,
		}),
		filteringStages,
	};

	// Return filtered providers (body unchanged)
	return {
		ok: true,
		providers: tokenResult.providers,
		body: tokenResult.body,
		requestedParams,
		paramRoutingDiagnostics: diagnostics,
	};
}
