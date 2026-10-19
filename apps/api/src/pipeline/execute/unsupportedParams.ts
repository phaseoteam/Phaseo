// Purpose: Remove optional request parameters the chosen provider does not support.
// Why: Clients (and SDKs) send OpenAI defaults to every model. Forwarding a field
//      the provider's API does not define gets a 400 or is silently ignored;
//      rejecting the request breaks those clients. The gateway drops it instead
//      and reports the drop (X-Phaseo-Dropped-Params, meta.routing.dropped_params,
//      routing diagnostics).
// How: Runs per provider attempt in the execute stage, before the executor. The
//      provider profile (`@providers/providerProfiles`) decides first; the
//      route's catalogue params decide next, for the sampling parameters the
//      catalogue tracks. A route that declares no params (an empty record, or
//      one holding only route metadata) skips the catalogue check; the
//      profile's explicit exclusions still apply.

import type { IRChatRequest } from "@core/ir";
import {
	expandCapabilityParamAliases,
	gatewayMappedParamIds,
	resolveProviderParamSupportOverride,
} from "@pipeline/before/textParamPolicy";

export type DroppedParamReason = "unsupported_by_provider" | "value_not_supported";

export type DroppedParam = {
	/** Client-facing parameter name, for example `top_k`. */
	param: string;
	reason: DroppedParamReason;
	/** Where the decision came from. */
	source: "provider_profile" | "catalogue";
};

type OptionalParam = {
	param: string;
	field: keyof IRChatRequest;
	/**
	 * Whether the catalogue's per-route params decide support. Only parameters
	 * the catalogue records on most routes are judged by absence; others are
	 * dropped only when the provider profile marks them unsupported.
	 */
	catalogueTracked: boolean;
};

// Optional generation controls: removing one changes sampling, never the
// conversation, the tools or the output format. Messages, tools, tool_choice,
// response_format, reasoning, max_tokens, stream and gateway-only options
// (session_id, meta, usage, debug, echo_upstream_request) are never dropped here.
const OPTIONAL_PARAMS: OptionalParam[] = [
	{ param: "temperature", field: "temperature", catalogueTracked: true },
	{ param: "top_p", field: "topP", catalogueTracked: true },
	{ param: "top_k", field: "topK", catalogueTracked: true },
	{ param: "min_p", field: "minP", catalogueTracked: true },
	{ param: "repetition_penalty", field: "repetitionPenalty", catalogueTracked: true },
	{ param: "frequency_penalty", field: "frequencyPenalty", catalogueTracked: true },
	{ param: "presence_penalty", field: "presencePenalty", catalogueTracked: true },
	{ param: "logit_bias", field: "logitBias", catalogueTracked: true },
	{ param: "logprobs", field: "logprobs", catalogueTracked: true },
	{ param: "top_logprobs", field: "topLogprobs", catalogueTracked: true },
	{ param: "seed", field: "seed", catalogueTracked: true },
	{ param: "stop", field: "stop", catalogueTracked: true },
	{ param: "parallel_tool_calls", field: "parallelToolCalls", catalogueTracked: false },
	{ param: "max_tool_calls", field: "maxToolCalls", catalogueTracked: false },
	{ param: "image_config", field: "imageConfig", catalogueTracked: false },
];

function isPlainObject(value: unknown): value is Record<string, any> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Request parameters that the catalogue also uses to carry route metadata
// (`service_tier.provider_catalog`, `reasoning.maxReasoningTokens`). A record
// holding only these describes the route; it does not list its parameters.
const METADATA_CARRYING_PARAMS = new Set(["service_tier", "serviceTier", "reasoning", "thinking"]);

let requestParamKeys: Set<string> | null = null;

/** Every key, with aliases, that names a text request parameter the gateway maps. */
function isRequestParamKey(key: string): boolean {
	if (!requestParamKeys) {
		requestParamKeys = new Set<string>();
		for (const id of gatewayMappedParamIds()) {
			requestParamKeys.add(id);
			for (const alias of expandCapabilityParamAliases(id)) requestParamKeys.add(alias);
		}
	}
	return requestParamKeys.has(key) && !METADATA_CARRYING_PARAMS.has(key);
}

/**
 * The catalogue stores route params as a record (`{ top_k: {...} }`), a list of
 * ids, or a list of `{ param_id, ... }` rows. Returns null when the route
 * declares no parameters, which means "unknown", not "unsupported". The record
 * also carries route metadata (`service_tier`, `reasoning`, `data_policy`,
 * `box`, `long_context`), so it counts as a parameter list only when it names
 * at least one other request parameter the gateway maps (`max_tokens`,
 * `tools`, `temperature`, ...).
 */
export function declaredRouteParams(capabilityParams: unknown): Record<string, any> | null {
	let record: Record<string, any>;
	if (Array.isArray(capabilityParams)) {
		record = {};
		for (const entry of capabilityParams) {
			if (typeof entry === "string" && entry.trim()) record[entry.trim()] = {};
			else if (isPlainObject(entry) && typeof entry.param_id === "string" && entry.param_id.trim()) {
				const { param_id: paramId, ...config } = entry;
				record[paramId.trim()] = config;
			}
		}
	} else if (isPlainObject(capabilityParams)) {
		record = capabilityParams;
	} else {
		return null;
	}
	return Object.keys(record).some(isRequestParamKey) ? record : null;
}

function declaredConfig(params: Record<string, any>, param: string): { declared: boolean; config: Record<string, any> | null } {
	for (const key of expandCapabilityParamAliases(param)) {
		if (key in params) return { declared: true, config: isPlainObject(params[key]) ? params[key] : null };
	}
	return { declared: false, config: null };
}

function allowedValues(config: Record<string, any> | null): unknown[] | null {
	const values = config?.supported_values ?? config?.allowed_values ?? config?.enum ?? config?.values;
	return Array.isArray(values) && values.length > 0 ? values : null;
}

function valueAllowed(value: unknown, allowed: unknown[]): boolean {
	const list = Array.isArray(value) ? value : [value];
	return list.every((entry) => allowed.some((option) => option === entry || String(option).toLowerCase() === String(entry).toLowerCase()));
}

/**
 * Removes the optional parameters the provider does not support, and values
 * outside a declared list, from a text request. Returns the request unchanged
 * (same object) when nothing is dropped.
 */
export function dropUnsupportedParams(
	ir: IRChatRequest,
	providerId: string,
	capabilityParams: unknown,
): { ir: IRChatRequest; dropped: DroppedParam[] } {
	const params = declaredRouteParams(capabilityParams);
	const dropped: DroppedParam[] = [];
	let next: IRChatRequest | null = null;
	for (const entry of OPTIONAL_PARAMS) {
		const value = ir[entry.field];
		if (value === undefined || value === null) continue;
		const override = resolveProviderParamSupportOverride(providerId, entry.param);
		let decision: DroppedParam | null = null;
		if (override === false) {
			decision = { param: entry.param, reason: "unsupported_by_provider", source: "provider_profile" };
		} else if (params) {
			const { declared, config } = declaredConfig(params, entry.param);
			if (!declared && override !== true && entry.catalogueTracked) {
				decision = { param: entry.param, reason: "unsupported_by_provider", source: "catalogue" };
			} else if (declared) {
				const allowed = allowedValues(config);
				if (allowed && !valueAllowed(value, allowed)) {
					decision = { param: entry.param, reason: "value_not_supported", source: "catalogue" };
				}
			}
		}
		if (!decision) continue;
		next ??= { ...ir };
		delete next[entry.field];
		dropped.push(decision);
	}
	return { ir: next ?? ir, dropped };
}

/** Response header naming the client parameters the gateway removed. */
export const DROPPED_PARAMS_HEADER = "X-Phaseo-Dropped-Params";

/** `X-Phaseo-Dropped-Params` value: the dropped client parameter names, comma separated. */
export function droppedParamsHeader(dropped: Array<Pick<DroppedParam, "param">>): string {
	return Array.from(new Set(dropped.map((entry) => entry.param))).join(", ");
}

/** What the request context keeps for the provider attempt that ran last. */
export type DroppedParamsRecord = {
	provider: string;
	params: Array<DroppedParam & { client_sent: boolean }>;
};

type DroppedParamsContext = {
	endpoint?: string | null;
	requestedParams?: string[] | null;
	routingDiagnostics?: Record<string, any> | null;
};

// Client-facing names where a surface spells a parameter differently.
const SURFACE_PARAM_NAMES: Record<string, Record<string, string>> = {
	messages: { stop: "stop_sequences" },
};

/**
 * Records the drops for this provider attempt in the routing diagnostics (sent
 * to the audit log and returned under `routing_diagnostics`). A later attempt
 * on another provider replaces them. A drop counts as client-sent when the
 * client's body named the parameter; values filled in by a preset or a schema
 * default are recorded but not reported in the response.
 */
export function recordDroppedParams(ctx: DroppedParamsContext, providerId: string, dropped: DroppedParam[]): void {
	const requested = new Set(ctx.requestedParams ?? []);
	const names = SURFACE_PARAM_NAMES[String(ctx.endpoint ?? "")] ?? {};
	const record: DroppedParamsRecord = {
		provider: providerId,
		params: dropped.map((entry) => ({
			...entry,
			param: names[entry.param] ?? entry.param,
			client_sent: requested.has(entry.param),
		})),
	};
	// Copy on write: sub-requests (advisor, image tools) run on shallow copies of
	// the request context and must not overwrite the main request's record.
	ctx.routingDiagnostics = { ...(ctx.routingDiagnostics ?? {}), droppedParams: record };
}

/** Forgets the previous attempt's drops before the next provider is tried. */
export function clearDroppedParams(ctx: DroppedParamsContext): void {
	if (!ctx.routingDiagnostics || !("droppedParams" in ctx.routingDiagnostics)) return;
	const { droppedParams: _previous, ...rest } = ctx.routingDiagnostics;
	ctx.routingDiagnostics = rest;
}

function isDroppedParamsRecord(value: unknown): value is DroppedParamsRecord {
	if (!value || typeof value !== "object") return false;
	const record = value as Partial<DroppedParamsRecord>;
	return (
		typeof record.provider === "string" &&
		Array.isArray(record.params) &&
		record.params.every((entry) => Boolean(entry) && typeof entry === "object" && typeof entry.param === "string")
	);
}

/** The drops to store with a cached response, so a cache hit reports what the cached result was generated without. */
export function cachedDroppedParams(ctx: { routingDiagnostics?: Record<string, any> | null }): DroppedParamsRecord | null {
	const record = ctx.routingDiagnostics?.droppedParams;
	return isDroppedParamsRecord(record) ? record : null;
}

/**
 * Puts a cached response's drops back on the request context, so the header,
 * `meta.routing.dropped_params` and the audit report them as for a live call.
 * Entries cached before drops were stored carry none and change nothing.
 */
export function restoreDroppedParams(ctx: DroppedParamsContext, stored: unknown): void {
	if (!isDroppedParamsRecord(stored)) return;
	ctx.routingDiagnostics = { ...(ctx.routingDiagnostics ?? {}), droppedParams: stored };
}

/** The drops to report to the client: those of the provider that served it, client-sent only. */
export function droppedParamsForClient(ctx: { routingDiagnostics?: Record<string, any> | null }): Array<DroppedParam & { provider: string }> {
	const record = ctx.routingDiagnostics?.droppedParams as DroppedParamsRecord | undefined;
	if (!record || !Array.isArray(record.params)) return [];
	return record.params
		.filter((entry) => entry.client_sent)
		.map(({ client_sent: _clientSent, ...entry }) => ({ ...entry, provider: record.provider }));
}
