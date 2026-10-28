// Purpose: Keep OpenAI hosted tools off routes that cannot run them.
// Why: OpenAI's hosted tools (`web_search`, `file_search`, `code_interpreter`,
//      `computer_use_preview`, `mcp`, `image_generation`, `shell`,
//      `apply_patch`, ...) run inside OpenAI's Responses API. Forwarded to any
//      other provider they arrive as tool definitions that provider's API does
//      not define (Claude got `{type:"web_search", name:"web_search"}`, Gemini
//      an empty function stub the model could call).
// How: Runs in the before stage on the final provider candidates.
//      - Every candidate runs the hosted tools: nothing changes.
//      - Some do: routing keeps those candidates only.
//      - None do: hosted web search becomes the gateway's own `phaseo:web_search`
//        server tool, which runs on any model; any other hosted tool fails the
//        request with a 400 naming it. Tools are never dropped silently: a model
//        missing a tool the conversation relies on would change the run.
//      `phaseo:web_search` with `engine: "native"` (also what the `web` plugin
//      adds for that engine) becomes OpenAI's hosted web search on these
//      endpoints later in the request, so it is routed the same way: native
//      candidates where there are any, otherwise our own search.

import type { Endpoint } from "@core/types";
import {
	isOpenAIHostedToolType,
	isOpenAINativeWebSearchToolType,
	routeRunsOpenAIHostedTool,
} from "@core/nativeTools";
import { WEB_SEARCH_SERVER_TOOL_FUNCTION_NAME } from "@pipeline/surfaces/server-tools";
import type { ProviderCandidate } from "./types";

const HOSTED_TOOL_ENDPOINTS = new Set<Endpoint>(["chat.completions", "responses"]);
const WEB_SEARCH_ENGINES = new Set(["auto", "exa", "firecrawl", "parallel", "perplexity", "tinyfish"]);
const SEARCH_CONTEXT_SIZES = new Set(["low", "medium", "high"]);
const MAX_WEB_SEARCH_RESULTS = 25;
const GATEWAY_WEB_SEARCH_TYPES = new Set(["phaseo:web_search", "gateway:web_search"]);

export type HostedToolResolution =
	| {
		ok: true;
		body: any;
		providers: ProviderCandidate[];
		/** Candidates removed because they cannot run a hosted tool in the request. */
		droppedProviderIds: string[];
		/** Whether hosted web search now runs as the gateway's phaseo:web_search. */
		webSearchMapped: boolean;
	}
	| {
		ok: false;
		unsupportedTools: Array<{ type: string; index: number }>;
	};

function isPlainObject(value: unknown): value is Record<string, any> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function domainList(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const domains = value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
	return domains.length > 0 ? domains : undefined;
}

/**
 * The `phaseo:web_search` equivalent of an OpenAI hosted web search tool. OpenAI's
 * fields (search_context_size, filters.allowed_domains) and the common search
 * options (engine, max_results, include/exclude domains, max_uses) carry over;
 * `user_location` does not, because our search takes the location per call.
 */
export function gatewayWebSearchToolFor(tool: Record<string, any>): Record<string, any> {
	const parameters: Record<string, unknown> = {};
	const contextSize = typeof tool.search_context_size === "string" ? tool.search_context_size.toLowerCase() : null;
	if (contextSize && SEARCH_CONTEXT_SIZES.has(contextSize)) parameters.search_context_size = contextSize;
	// "native" is the provider's own search, which this route does not have.
	const engine = typeof tool.engine === "string" ? tool.engine.toLowerCase() : null;
	if (engine && WEB_SEARCH_ENGINES.has(engine)) parameters.engine = engine;
	if (Number.isInteger(tool.max_results) && tool.max_results > 0 && tool.max_results <= MAX_WEB_SEARCH_RESULTS) {
		parameters.max_results = tool.max_results;
	}
	if (Number.isInteger(tool.max_uses) && tool.max_uses > 0) parameters.max_uses = tool.max_uses;
	const allowed = domainList(isPlainObject(tool.filters) ? tool.filters.allowed_domains : undefined)
		?? domainList(tool.allowed_domains)
		?? domainList(tool.include_domains);
	if (allowed) parameters.allowed_domains = allowed;
	const excluded = domainList(tool.excluded_domains) ?? domainList(tool.exclude_domains) ?? domainList(tool.blocked_domains);
	if (excluded) parameters.excluded_domains = excluded;
	return Object.keys(parameters).length > 0
		? { type: "phaseo:web_search", parameters }
		: { type: "phaseo:web_search" };
}

/** Whether a gateway search tool asks for the provider's own search (see ../surfaces/server-tools.ts). */
function isNativeEngineGatewaySearch(tool: unknown): tool is Record<string, any> {
	if (!isPlainObject(tool) || !GATEWAY_WEB_SEARCH_TYPES.has(tool.type)) return false;
	const engine = isPlainObject(tool.parameters) && tool.parameters.engine != null
		? tool.parameters.engine
		: tool.engine;
	return typeof engine === "string" && engine.trim().toLowerCase() === "native";
}

/** The same gateway search tool on our own search engine (the default one). */
function withoutNativeEngine(tool: Record<string, any>): Record<string, any> {
	const { engine: _engine, ...rest } = tool;
	if (!isPlainObject(rest.parameters)) return rest;
	const { engine: _parameterEngine, ...parameters } = rest.parameters;
	return { ...rest, parameters };
}

function namesHostedWebSearch(toolChoice: unknown): boolean {
	if (typeof toolChoice === "string") return isOpenAINativeWebSearchToolType(toolChoice.trim());
	if (!isPlainObject(toolChoice)) return false;
	return isOpenAINativeWebSearchToolType(toolChoice.type)
		|| isOpenAINativeWebSearchToolType(toolChoice.name)
		|| isOpenAINativeWebSearchToolType(toolChoice.function?.name);
}

/**
 * Points the hosted web search entries of an `allowed_tools` choice at the
 * function `phaseo:web_search` is exposed as, in the choice's own shape:
 * Responses lists `{type, name}` entries under `tools`, Chat Completions
 * `{type, function: {name}}` entries under `allowed_tools.tools`
 * (https://platform.openai.com/docs/api-reference/responses/create#responses-create-tool_choice,
 * https://platform.openai.com/docs/api-reference/chat/create#chat-create-tool_choice).
 * Returns null when the choice is not one that names hosted web search.
 */
function rewriteAllowedToolsChoice(toolChoice: unknown): Record<string, any> | null {
	if (!isPlainObject(toolChoice) || toolChoice.type !== "allowed_tools") return null;
	const chatShape = isPlainObject(toolChoice.allowed_tools);
	const entries = chatShape ? toolChoice.allowed_tools.tools : toolChoice.tools;
	if (!Array.isArray(entries) || !entries.some(namesHostedWebSearch)) return null;
	const searchEntry = chatShape
		? { type: "function", function: { name: WEB_SEARCH_SERVER_TOOL_FUNCTION_NAME } }
		: { type: "function", name: WEB_SEARCH_SERVER_TOOL_FUNCTION_NAME };
	const isSearchEntry = (entry: unknown) => isPlainObject(entry)
		&& entry.type === "function"
		&& (entry.name ?? entry.function?.name) === WEB_SEARCH_SERVER_TOOL_FUNCTION_NAME;
	const rewritten: unknown[] = [];
	let hasSearchEntry = entries.some(isSearchEntry);
	for (const entry of entries) {
		if (!namesHostedWebSearch(entry)) {
			rewritten.push(entry);
			continue;
		}
		if (hasSearchEntry) continue;
		rewritten.push(searchEntry);
		hasSearchEntry = true;
	}
	return chatShape
		? { ...toolChoice, allowed_tools: { ...toolChoice.allowed_tools, tools: rewritten } }
		: { ...toolChoice, tools: rewritten };
}

function rewriteHostedWebSearch(body: any): any {
	const tools: any[] = [];
	let hasGatewaySearch = body.tools.some((tool: any) => isPlainObject(tool) && GATEWAY_WEB_SEARCH_TYPES.has(tool.type));
	for (const tool of body.tools) {
		if (isNativeEngineGatewaySearch(tool)) {
			tools.push(withoutNativeEngine(tool));
			continue;
		}
		if (!isPlainObject(tool) || !isOpenAINativeWebSearchToolType(tool.type)) {
			tools.push(tool);
			continue;
		}
		// One search tool is enough; a second would only replace the first's settings.
		if (hasGatewaySearch) continue;
		tools.push(gatewayWebSearchToolFor(tool));
		hasGatewaySearch = true;
	}
	const allowedToolsChoice = rewriteAllowedToolsChoice(body.tool_choice);
	return {
		...body,
		tools,
		...(allowedToolsChoice
			? { tool_choice: allowedToolsChoice }
			: namesHostedWebSearch(body.tool_choice) ? { tool_choice: "phaseo:web_search" } : {}),
	};
}

export function resolveHostedTools(args: {
	endpoint: Endpoint;
	body: any;
	providers: ProviderCandidate[];
	model?: string | null;
}): HostedToolResolution {
	const unchanged: HostedToolResolution = {
		ok: true,
		body: args.body,
		providers: args.providers,
		droppedProviderIds: [],
		webSearchMapped: false,
	};
	if (!HOSTED_TOOL_ENDPOINTS.has(args.endpoint) || !isPlainObject(args.body) || !Array.isArray(args.body.tools)) {
		return unchanged;
	}
	const hosted = (args.body.tools as any[])
		.map((tool, index) => ({
			type: isNativeEngineGatewaySearch(tool) ? "web_search" : isPlainObject(tool) ? tool.type : undefined,
			index,
		}))
		.filter((entry): entry is { type: string; index: number } => isOpenAIHostedToolType(entry.type));
	if (hosted.length === 0 || args.providers.length === 0) return unchanged;

	const runs = (provider: ProviderCandidate, type: string) => routeRunsOpenAIHostedTool({
		providerId: provider.providerId,
		model: provider.providerModelSlug ?? provider.apiModelId ?? args.model ?? null,
		endpoint: args.endpoint,
		toolType: type,
	});
	const keep = (providers: ProviderCandidate[]) => ({
		providers,
		droppedProviderIds: args.providers
			.filter((provider) => !providers.includes(provider))
			.map((provider) => provider.providerId),
	});

	const runsAll = args.providers.filter((provider) => hosted.every((entry) => runs(provider, entry.type)));
	if (runsAll.length === args.providers.length) return unchanged;
	if (runsAll.length > 0) {
		return { ok: true, body: args.body, ...keep(runsAll), webSearchMapped: false };
	}

	// No candidate runs every hosted tool natively. Web search has a gateway
	// equivalent; the other hosted tools must still run natively somewhere.
	const others = hosted.filter((entry) => !isOpenAINativeWebSearchToolType(entry.type));
	const runsOthers = args.providers.filter((provider) => others.every((entry) => runs(provider, entry.type)));
	if (runsOthers.length === 0) {
		const unsupported = others.filter((entry) => !args.providers.some((provider) => runs(provider, entry.type)));
		return { ok: false, unsupportedTools: unsupported.length > 0 ? unsupported : others };
	}
	return {
		ok: true,
		body: rewriteHostedWebSearch(args.body),
		...keep(runsOthers),
		webSearchMapped: true,
	};
}
