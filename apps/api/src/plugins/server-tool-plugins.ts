// Purpose: Request plugins that switch on a gateway server tool.
// Why: `plugins: [{ id: "web" }]` and `{ id: "web-fetch" }` add web search or
//      page fetching to any model without the client writing a tool entry.
// How: Before routing, each enabled plugin becomes the matching server tool
//      (`phaseo:web_search`, `phaseo:web_fetch`) in the request's tools. From
//      there the request runs exactly as if the client had sent that tool, so
//      execution, usage counters and billing are the server tool's own.

import type { Endpoint } from "@core/types";
import {
	isNativeWebFetchTool,
	isNativeWebSearchTool,
} from "@core/nativeTools";
import type { NormalizedGatewayPluginConfig } from "./types";

export const WEB_SEARCH_PLUGIN_ID = "web";
export const WEB_FETCH_PLUGIN_ID = "web-fetch";

/** Plugins applied to the request before routing (not to the response). */
export const SERVER_TOOL_PLUGIN_IDS = [WEB_SEARCH_PLUGIN_ID, WEB_FETCH_PLUGIN_ID] as const;

const SERVER_TOOL_PLUGIN_ID_SET = new Set<string>(SERVER_TOOL_PLUGIN_IDS);

export function isServerToolPluginId(id: string): boolean {
	return SERVER_TOOL_PLUGIN_ID_SET.has(String(id ?? "").trim().toLowerCase());
}

// The engines and limits `phaseo:web_search` / `phaseo:web_fetch` accept (core/schemas.ts).
const WEB_SEARCH_ENGINES = ["auto", "native", "exa", "firecrawl", "parallel", "perplexity", "tinyfish"];
const WEB_FETCH_ENGINES = ["auto", "native", "direct", "exa", "firecrawl", "parallel"];
const SEARCH_CONTEXT_SIZES = ["low", "medium", "high"];
const MAX_WEB_SEARCH_RESULTS = 25;
const MAX_WEB_FETCH_CHARS = 100000;

const TEXT_ENDPOINTS = new Set<Endpoint>(["chat.completions", "responses", "messages"]);

const WEB_SEARCH_TOOL_TYPES = new Set(["phaseo:web_search", "gateway:web_search"]);
const WEB_FETCH_TOOL_TYPES = new Set(["phaseo:web_fetch", "gateway:web_fetch"]);

export type ServerToolPluginResult =
	| { ok: true; body: any; addedTools: string[] }
	| { ok: false; pluginId: string; field: string; message: string };

type FieldError = { field: string; message: string };

function isPositiveInteger(value: unknown, max?: number): boolean {
	return typeof value === "number" && Number.isInteger(value) && value > 0 && (max === undefined || value <= max);
}

function isDomainList(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry.trim().length > 0);
}

/** Copies the options the plugin shares with the server tool, checking each the way the tool schema does. */
function readPluginOptions(
	config: Record<string, unknown>,
	spec: Record<string, { target: string; check: (value: unknown) => boolean; expected: string }>,
): { parameters: Record<string, unknown> } | FieldError {
	const parameters: Record<string, unknown> = {};
	for (const [field, rule] of Object.entries(spec)) {
		const value = config[field];
		if (value === undefined || value === null) continue;
		if (!rule.check(value)) return { field, message: `${field} must be ${rule.expected}.` };
		parameters[rule.target] = typeof value === "string" ? value.trim().toLowerCase() : value;
	}
	return { parameters };
}

const WEB_SEARCH_OPTIONS = {
	engine: {
		target: "engine",
		check: (value: unknown) => typeof value === "string" && WEB_SEARCH_ENGINES.includes(value.trim().toLowerCase()),
		expected: `one of ${WEB_SEARCH_ENGINES.join(", ")}`,
	},
	max_results: {
		target: "max_results",
		check: (value: unknown) => isPositiveInteger(value, MAX_WEB_SEARCH_RESULTS),
		expected: `an integer from 1 to ${MAX_WEB_SEARCH_RESULTS}`,
	},
	max_uses: { target: "max_uses", check: (value: unknown) => isPositiveInteger(value), expected: "a positive integer" },
	search_context_size: {
		target: "search_context_size",
		check: (value: unknown) => typeof value === "string" && SEARCH_CONTEXT_SIZES.includes(value.trim().toLowerCase()),
		expected: `one of ${SEARCH_CONTEXT_SIZES.join(", ")}`,
	},
	include_domains: { target: "allowed_domains", check: isDomainList, expected: "a list of domains" },
	allowed_domains: { target: "allowed_domains", check: isDomainList, expected: "a list of domains" },
	exclude_domains: { target: "excluded_domains", check: isDomainList, expected: "a list of domains" },
	excluded_domains: { target: "excluded_domains", check: isDomainList, expected: "a list of domains" },
};

const WEB_FETCH_OPTIONS = {
	engine: {
		target: "engine",
		check: (value: unknown) => typeof value === "string" && WEB_FETCH_ENGINES.includes(value.trim().toLowerCase()),
		expected: `one of ${WEB_FETCH_ENGINES.join(", ")}`,
	},
	max_uses: { target: "max_uses", check: (value: unknown) => isPositiveInteger(value), expected: "a positive integer" },
	max_content_tokens: {
		target: "max_content_tokens",
		check: (value: unknown) => isPositiveInteger(value, MAX_WEB_FETCH_CHARS),
		expected: `an integer from 1 to ${MAX_WEB_FETCH_CHARS}`,
	},
	max_chars: {
		target: "max_chars",
		check: (value: unknown) => isPositiveInteger(value, MAX_WEB_FETCH_CHARS),
		expected: `an integer from 1 to ${MAX_WEB_FETCH_CHARS}`,
	},
	allowed_domains: { target: "allowed_domains", check: isDomainList, expected: "a list of domains" },
	blocked_domains: { target: "blocked_domains", check: isDomainList, expected: "a list of domains" },
	excluded_domains: { target: "blocked_domains", check: isDomainList, expected: "a list of domains" },
};

function hasWebSearchTool(tools: any[]): boolean {
	return tools.some((tool) => tool && typeof tool === "object" && (WEB_SEARCH_TOOL_TYPES.has(tool.type) || isNativeWebSearchTool(tool)));
}

function hasWebFetchTool(tools: any[]): boolean {
	return tools.some((tool) => tool && typeof tool === "object" && (WEB_FETCH_TOOL_TYPES.has(tool.type) || isNativeWebFetchTool(tool)));
}

/**
 * Adds the server tool each enabled `web` / `web-fetch` plugin stands for.
 * A request that already carries a web search (or fetch) tool keeps its own
 * tool and the plugin adds nothing, so the search is never offered twice.
 * Other endpoints, and requests without these plugins, are returned unchanged.
 */
export function applyServerToolPlugins(args: {
	endpoint: Endpoint;
	body: any;
	plugins: NormalizedGatewayPluginConfig[];
}): ServerToolPluginResult {
	const { body } = args;
	if (!TEXT_ENDPOINTS.has(args.endpoint) || !body || typeof body !== "object") {
		return { ok: true, body, addedTools: [] };
	}
	const active = args.plugins.filter((plugin) => plugin.enabled !== false && isServerToolPluginId(plugin.id));
	if (active.length === 0) return { ok: true, body, addedTools: [] };

	const tools: any[] = Array.isArray(body.tools) ? [...body.tools] : [];
	const addedTools: string[] = [];
	for (const plugin of active) {
		const isSearch = plugin.id === WEB_SEARCH_PLUGIN_ID;
		const options = readPluginOptions(plugin.config ?? {}, isSearch ? WEB_SEARCH_OPTIONS : WEB_FETCH_OPTIONS);
		if ("field" in options) return { ok: false, pluginId: plugin.id, ...options };
		if (isSearch ? hasWebSearchTool(tools) : hasWebFetchTool(tools)) continue;
		const type = isSearch ? "phaseo:web_search" : "phaseo:web_fetch";
		tools.push(Object.keys(options.parameters).length > 0 ? { type, parameters: options.parameters } : { type });
		addedTools.push(type);
	}
	if (addedTools.length === 0) return { ok: true, body, addedTools };
	return { ok: true, body: { ...body, tools }, addedTools };
}
