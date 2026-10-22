// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

// SpaceXAI Provider Quirks
// Maps SpaceXAI usage detail fields into OpenAI-compatible naming.

import type { ProviderQuirks } from "../../quirks/types";

function isReasoningModel(model: unknown): boolean {
	if (typeof model !== "string") return false;
	const normalized = model.toLowerCase();
	if (normalized.includes("non-reasoning")) return false;
	return normalized.includes("reasoning") || normalized.includes("grok-4");
}

function count(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * xAI counts reasoning tokens outside output: its documented usage examples give
 * `"output_tokens": 9, "reasoning_tokens": 110, "total_tokens": 151` for 32 input tokens
 * (Chat: completion 9 + reasoning 94, total 135; https://docs.x.ai/openapi.json), and
 * "reasoning tokens are billed as part of your total consumption"
 * (https://docs.x.ai/developers/model-capabilities/text/reasoning). Fold them into the
 * output counts so usage follows OpenAI semantics (reasoning is part of output) and the
 * reasoning is billed. Only applies when the total proves reasoning sits outside output,
 * so running it twice, or on usage that already includes reasoning, changes nothing.
 */
export function foldXAiReasoningIntoOutput(usage: any): void {
	if (!usage || typeof usage !== "object") return;
	const reasoning = count(usage.output_tokens_details?.reasoning_tokens) ??
		count(usage.completion_tokens_details?.reasoning_tokens);
	if (!reasoning) return;
	const input = count(usage.input_tokens) ?? count(usage.prompt_tokens);
	const output = count(usage.output_tokens) ?? count(usage.completion_tokens);
	const total = count(usage.total_tokens);
	if (input === undefined || output === undefined || total === undefined) return;
	if (total !== input + output + reasoning) return;
	if (typeof usage.output_tokens === "number") usage.output_tokens += reasoning;
	if (typeof usage.completion_tokens === "number") usage.completion_tokens += reasoning;
}

/**
 * Billable server-side tool counts from xAI's `usage.server_side_tool_usage_details`
 * (https://docs.x.ai/openapi.json, ServerSideToolUsageDetails), keyed the way pricing reads
 * `server_tool_use`. Priced per call for web search and code execution, per post and per
 * user profile fetched for X search (https://docs.x.ai/developers/pricing). MCP calls are
 * not charged and the other tools are not sent by the gateway.
 */
export function xAiServerToolUse(usage: any): Record<string, number> | undefined {
	const details = usage?.server_side_tool_usage_details;
	if (!details || typeof details !== "object") return undefined;
	const counts: Record<string, number> = {};
	const webSearch = count(details.web_search_calls);
	const codeExecution = count(details.code_interpreter_calls);
	const xPosts = count(details.x_posts_fetched);
	const xUsers = count(details.x_users_fetched);
	if (webSearch !== undefined) counts.web_search_requests = webSearch;
	if (codeExecution !== undefined) counts.code_execution_requests = codeExecution;
	if (xPosts !== undefined) counts.x_search_posts = xPosts;
	if (xUsers !== undefined) counts.x_search_users = xUsers;
	return Object.keys(counts).length ? counts : undefined;
}

/**
 * Flat server-tool meters plus `server_tool_use` for a pricing bill. Buffered usage keeps the
 * flat meters (the client payload never carries them), streamed usage keeps server_tool_use
 * (the only form client usage shaping passes through).
 */
export function xAiServerToolMeters(usage: any): Record<string, unknown> {
	const serverToolUse = xAiServerToolUse(usage);
	if (!serverToolUse) return {};
	return {
		...(serverToolUse.web_search_requests !== undefined ? { native_web_search_requests: serverToolUse.web_search_requests } : {}),
		...(serverToolUse.code_execution_requests !== undefined ? { native_code_execution_requests: serverToolUse.code_execution_requests } : {}),
		...(serverToolUse.x_search_posts !== undefined ? { native_x_search_posts: serverToolUse.x_search_posts } : {}),
		...(serverToolUse.x_search_users !== undefined ? { native_x_search_users: serverToolUse.x_search_users } : {}),
		server_tool_use: serverToolUse,
	};
}

export const xAiQuirks: ProviderQuirks = {
	transformRequest: ({ request, model }) => {
		// xAI accepts json_schema structured outputs on both APIs (text.format on Responses,
		// response_format on Chat; https://docs.x.ai/developers/model-capabilities/text/structured-outputs),
		// so the schema is sent as is.

		// SpaceXAI reasoning models reject presence_penalty/frequency_penalty/stop.
		// Keep requests compatible by stripping these upfront.
		if (isReasoningModel(model ?? request?.model)) {
			delete request.presence_penalty;
			delete request.frequency_penalty;
			delete request.stop;
		}
	},

	normalizeResponse: ({ response }) => {
		const usage = response?.usage;
		if (!usage || typeof usage !== "object") return;

		// SpaceXAI uses prompt/completion detail keys; map them to OpenAI-compatible names.
		if (!usage.input_tokens_details && usage.prompt_tokens_details) {
			usage.input_tokens_details = usage.prompt_tokens_details;
		}
		if (!usage.output_tokens_details && usage.completion_tokens_details) {
			usage.output_tokens_details = usage.completion_tokens_details;
		}

		// Ensure token totals are present for downstream billing.
		if (usage.input_tokens == null && usage.prompt_tokens != null) {
			usage.input_tokens = usage.prompt_tokens;
		}
		if (usage.output_tokens == null && usage.completion_tokens != null) {
			usage.output_tokens = usage.completion_tokens;
		}
		if (usage.total_tokens == null && (usage.input_tokens != null || usage.output_tokens != null)) {
			usage.total_tokens = (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
		}
		foldXAiReasoningIntoOutput(usage);

		// Keep request-count meter available for request-priced cards.
		if (typeof usage.requests !== "number") {
			usage.requests = 1;
		}
	},

	// Streamed clients see the same output count as buffered ones and as the bill.
	normalizeStreamedResponse: ({ response }) => foldXAiReasoningIntoOutput(response?.usage),
};
