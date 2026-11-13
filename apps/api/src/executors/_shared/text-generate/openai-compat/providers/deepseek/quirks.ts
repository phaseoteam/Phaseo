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
	isOpenAINativeWebSearchToolType,
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

		const usesWebTools = mapNativeWebTools(request);
		if (usesWebTools) {
			// With web tools declared DeepSeek rejects a tool_choice that names one, treats
			// "required" as "auto", and rejects logprobs
			// (https://api-docs.deepseek.com/guides/web_tools#chat-completions-api).
			if (request.tool_choice !== undefined && request.tool_choice !== "none") request.tool_choice = "auto";
			delete request.logprobs;
			delete request.top_logprobs;
		}

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
	},
};

/**
 * Native web search reaches this executor as the hosted tool of the request's
 * surface: OpenAI's `web_search` / `web_search_preview` (Chat, Responses) or
 * Anthropic's `web_search_*` / `web_fetch_*` (Messages). DeepSeek runs the same
 * thing as `deepseek_web_search` and `deepseek_read_url`, which take no options:
 * it rejects domain filters and `user_location` with a 400, so routing only sends
 * filter-free searches here (core/nativeTools.ts). Returns whether the request
 * now declares a DeepSeek web tool.
 */
function mapNativeWebTools(request: any): boolean {
	if (!Array.isArray(request.tools)) return false;
	const tools: any[] = [];
	const declared = new Set<string>();
	for (const tool of request.tools) {
		const type = typeof tool?.type === "string" ? tool.type : "";
		const deepseekType = type === DEEPSEEK_NATIVE_WEB_SEARCH_TOOL_TYPE
			|| isOpenAINativeWebSearchToolType(type)
			|| isAnthropicNativeWebSearchToolType(type)
			? DEEPSEEK_NATIVE_WEB_SEARCH_TOOL_TYPE
			: type === DEEPSEEK_NATIVE_READ_URL_TOOL_TYPE || isAnthropicNativeWebFetchToolType(type)
				? DEEPSEEK_NATIVE_READ_URL_TOOL_TYPE
				: null;
		if (!deepseekType) {
			tools.push(tool);
			continue;
		}
		// Declaring a web tool twice is a 400.
		if (declared.has(deepseekType)) continue;
		declared.add(deepseekType);
		tools.push({ type: deepseekType });
	}
	if (declared.size === 0) return false;
	request.tools = tools;
	return true;
}

/**
 * DeepSeek reports billed web tool calls as `server_tool_use.tool_search`,
 * `tool_image_search` and `tool_fetch`. Its `web_search_requests` /
 * `web_fetch_requests` count result blocks, errors included, and are not billed
 * (https://api-docs.deepseek.com/guides/web_tools), so the billed counts replace them.
 */
function normalizeDeepSeekServerToolUse(usage: any): void {
	const serverToolUse = usage.server_tool_use;
	if (!serverToolUse || typeof serverToolUse !== "object") return;
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
