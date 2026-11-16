// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

// DeepSeek Provider Quirks
// Handles reasoning_content field in thinking mode responses
// Documentation: https://api-docs.deepseek.com/guides/thinking_mode

import {
	DEEPSEEK_NATIVE_READ_URL_TOOL_TYPE,
	DEEPSEEK_NATIVE_WEB_SEARCH_TOOL_TYPE,
	isAnthropicNativeWebFetchToolType,
	isAnthropicNativeWebSearchToolType,
	isDeepSeekWebToolModel,
	isOpenAINativeWebSearchToolType,
	webToolNeedsOptionsDeepSeekLacks,
} from "@core/nativeTools";
import type { ProviderQuirks } from "../../quirks/types";
import { applyJsonSchemaFallback } from "../../quirks/structured";

export const deepseekQuirks: ProviderQuirks = {
	/**
	 * DeepSeek JSON mode supports json_object and rejects OpenAI json_schema payload shapes.
	 * Convert structured-output requests to json_object + instruction fallback.
	 */
	transformRequest: ({ request, ir }) => {
		applyJsonSchemaFallback(request);

		// DeepSeek documents system/user/assistant/tool message roles.
		// Normalize gateway "developer" role to "system" for compatibility.
		if (Array.isArray(request.messages)) {
			// reasoning_content stays on every assistant turn: with `tools`, DeepSeek needs it on
			// all earlier turns, plain answers included, or returns 400; without tools it is ignored
			// (https://api-docs.deepseek.com/guides/thinking_mode).
			request.messages = request.messages.map((msg: any) => msg?.role === "developer"
				? { ...msg, role: "system" }
				: msg);
		}

		if (request.user !== undefined && request.user_id === undefined) {
			request.user_id = request.user;
		}
		delete request.user;

		const model = String(ir.model ?? "").toLowerCase();
		const effort = ir.reasoning?.effort;
		if (
			(model.includes("deepseek-v4-pro") || model.includes("deepseek-v4-flash") || model.includes("deepseek-v4.1-flash")) &&
			typeof effort === "string" &&
			effort !== "none" &&
			request.reasoning_effort == null
		) {
			request.reasoning_effort = effort === "minimal"
				? "low"
				: effort === "low" || effort === "max"
					? effort
					: "high";
		}

		mapNativeWebTools(request, ir.model);

		if (request.thinking?.type === "enabled") {
			// DeepSeek's official agent integration notes that thinking-mode tool
			// requests reject tool_choice even though non-thinking Chat accepts it.
			delete request.tool_choice;
		}

		for (const unsupported of [
			"top_k", "logit_bias", "parallel_tool_calls", "max_tool_calls", "seed",
			"frequency_penalty", "presence_penalty", "repetition_penalty", "background",
			"service_tier", "prompt_cache_key", "prompt_cache_retention",
			"prompt_cache_options", "verbosity", "audio", "safety_identifier", "metadata",
			"modalities", "image_config", "web_search_options",
		]) {
			delete request[unsupported];
		}
	},

	/**
	 * Extract reasoning from DeepSeek's reasoning_content field
	 * DeepSeek returns reasoning in choice.message.reasoning_content when thinking mode is enabled
	 */
	extractReasoning: ({ choice, rawContent }) => {
		const reasoningContent = choice.message?.reasoning_content;

		if (typeof reasoningContent === "string" && reasoningContent.length > 0) {
			return {
				main: rawContent,
				reasoning: [reasoningContent],
			};
		}

		return {
			main: rawContent,
			reasoning: [],
		};
	},

	/**
	 * Transform streaming chunks to accumulate reasoning_content deltas
	 * DeepSeek streams reasoning via delta.reasoning_content
	 */
	transformStreamChunk: ({ chunk, accumulated }) => {
		if (!chunk || !Array.isArray(chunk.choices)) return;
		normalizeDeepSeekUsage(chunk);
		const requestId = accumulated.requestId ?? "req";
		const stateMap = (accumulated.choiceStates ??= new Map<number, { reasoningChunks: string[] }>());

		const isFinal =
			chunk.object === "chat.completion" ||
			(Array.isArray(chunk.choices) && chunk.choices.some((c: any) => c?.finish_reason));

		for (const choice of chunk.choices) {
			const idx = Number(choice.index ?? 0);
			const state = stateMap.get(idx) ?? { reasoningChunks: [] };
			if (!stateMap.has(idx)) stateMap.set(idx, state);

			addSourceAnnotations(choice.delta, (accumulated.citedUrls ??= new Set<string>()));

			// Accumulate reasoning deltas
			if (typeof choice.delta?.reasoning_content === "string") {
				state.reasoningChunks.push(choice.delta.reasoning_content);
			}

			// Build final reasoning_details on completion
			if (isFinal) {
				const reasoning = state.reasoningChunks.length
					? state.reasoningChunks.join("")
					: choice.message?.reasoning_content;
				if (!reasoning) continue;

				// Ensure message object exists
				choice.message ??= {};
				choice.message.reasoning_content ??= reasoning;

				// Build reasoning_details array
				if (!choice.message.reasoning_details) {
					choice.message.reasoning_details = state.reasoningChunks.length
						? state.reasoningChunks.map((text, index) => ({
							id: `${requestId}-reasoning-${idx}-${index + 1}`,
							index,
							type: "text",
							text,
						}))
						: [{
							id: `${requestId}-reasoning-${idx}-1`,
							index: 0,
							type: "text",
							text: reasoning,
						}];
				}
			}
		}
	},

	normalizeResponse: ({ response }) => {
		normalizeDeepSeekUsage(response);
		if (Array.isArray(response?.choices)) {
			for (const choice of response.choices) addSourceAnnotations(choice?.message, new Set<string>());
		}
	},
};

/**
 * DeepSeek's web tools return no `annotations` and no citation markers in the text: the
 * pages behind an answer are only in `server_tool_calls[].calls[]`, as `sources` on a
 * search, `page` on a read link and `action.url` on a page a deep search opened (checked
 * live 2026-11-16). Each becomes a Chat
 * `url_citation` without a span, so every client surface gets the sources. `seen` keeps
 * a URL from being cited twice, across stream chunks too.
 */
type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function addSourceAnnotations(messageValue: unknown, seen: Set<string>): void {
	const message = asObject(messageValue);
	if (!message || !Array.isArray(message.server_tool_calls)) return;
	const annotations: JsonObject[] = [];
	const add = (url: unknown, title: unknown) => {
		if (typeof url !== "string" || url.length === 0 || seen.has(url)) return;
		seen.add(url);
		annotations.push({
			type: "url_citation",
			url_citation: { url, ...(typeof title === "string" && title.length > 0 ? { title } : {}) },
		});
	};
	for (const group of message.server_tool_calls) {
		for (const callValue of asArray(asObject(group)?.calls)) {
			const call = asObject(callValue);
			if (!call) continue;
			for (const sourceValue of asArray(call.sources)) {
				const source = asObject(sourceValue);
				if (source) add(source.url, source.title);
			}
			const page = asObject(call.page);
			if (page) add(page.url, page.title);
			const action = asObject(call.action);
			if (action?.type === "open_page") add(action.url, undefined);
		}
	}
	if (annotations.length === 0) return;
	message.annotations = [...asArray(message.annotations), ...annotations];
}

/** The DeepSeek web tool a native web tool becomes, or null for any other tool. */
function deepSeekWebToolType(tool: unknown): string | null {
	const type = asObject(tool)?.type;
	if (typeof type !== "string") return null;
	if (type === DEEPSEEK_NATIVE_WEB_SEARCH_TOOL_TYPE || isOpenAINativeWebSearchToolType(type) || isAnthropicNativeWebSearchToolType(type)) {
		return DEEPSEEK_NATIVE_WEB_SEARCH_TOOL_TYPE;
	}
	if (type === DEEPSEEK_NATIVE_READ_URL_TOOL_TYPE || isAnthropicNativeWebFetchToolType(type)) return DEEPSEEK_NATIVE_READ_URL_TOOL_TYPE;
	return null;
}

/**
 * Native web search reaches this executor as the hosted tool of the request's
 * surface: OpenAI's `web_search` / `web_search_preview` (Chat, Responses) or
 * Anthropic's `web_search_*` / `web_fetch_*` (Messages). DeepSeek runs the same
 * thing as `deepseek_web_search` and `deepseek_read_url`, which take no options.
 *
 * Routing (core/nativeTools.ts) sends Chat and Responses requests here only when
 * DeepSeek can honour them. Anthropic tools on Messages arrive as sent, so they are
 * converted only under the same terms: the model is Flash, every tool in the request is a web tool,
 * none carries domain lists, a location, `max_uses` or `max_content_tokens`, and
 * the request forces no tool_choice and asks for no log probabilities. Otherwise
 * the tools stay as sent and DeepSeek rejects the request, rather than running a
 * search without what the caller asked for (or, beside other tools, silently not
 * searching at all). Each was checked live on 2026-11-16 or is documented
 * (https://api-docs.deepseek.com/guides/web_tools).
 */
function mapNativeWebTools(request: JsonObject, model: unknown): void {
	const tools = asArray(request.tools);
	const types = tools.map(deepSeekWebToolType);
	if (types.length === 0 || types.some((type) => type === null)) return;
	// Only Flash serves DeepSeek's web tools.
	if (!isDeepSeekWebToolModel(typeof model === "string" ? model : null)) return;
	if (tools.some(webToolNeedsOptionsDeepSeekLacks)) return;
	const choice = request.tool_choice;
	if (choice !== undefined && choice !== null && choice !== "auto" && choice !== "none") return;
	if (request.logprobs === true || request.top_logprobs != null) return;
	// Declaring a web tool twice is a 400.
	request.tools = [...new Set(types as string[])].map((type) => ({ type }));
}

/**
 * DeepSeek reports billed web tool calls as `server_tool_use.tool_search`,
 * `tool_image_search` and `tool_fetch`. Its `web_search_requests` /
 * `web_fetch_requests` count result blocks, errors included, and are not billed
 * (https://api-docs.deepseek.com/guides/web_tools), so the billed counts replace them.
 */
function normalizeDeepSeekServerToolUse(usage: JsonObject): void {
	const serverToolUse = asObject(usage.server_tool_use);
	if (!serverToolUse) return;
	const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
	const searches = count(serverToolUse.tool_search);
	const imageSearches = count(serverToolUse.tool_image_search);
	const fetches = count(serverToolUse.tool_fetch);
	if (searches === undefined && imageSearches === undefined && fetches === undefined) return;
	usage.server_tool_use = {
		...serverToolUse,
		web_search_requests: (searches ?? 0) + (imageSearches ?? 0),
		web_fetch_requests: fetches ?? 0,
	};
}

function normalizeDeepSeekUsage(response: any): void {
	const usage = response?.usage;
	if (!usage || typeof usage !== "object") return;
	normalizeDeepSeekServerToolUse(usage);
	const cacheHit = usage.prompt_cache_hit_tokens;
	const cacheMiss = usage.prompt_cache_miss_tokens;
	if (typeof cacheHit === "number") {
		usage.prompt_tokens_details = {
			...(usage.prompt_tokens_details ?? {}),
			cached_tokens: cacheHit,
		};
	}
	if (typeof cacheMiss === "number") {
		usage.prompt_tokens_details = {
			...(usage.prompt_tokens_details ?? {}),
			cache_miss_tokens: cacheMiss,
		};
	}
}
