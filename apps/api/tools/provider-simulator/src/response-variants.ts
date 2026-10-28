// Purpose: The provider responses each route is fed, and what the client should see for each.
// Why: Losses (tool ids, signatures, citations, usage) are only provable against an explicit expectation.
// How: Semantic variants rendered per dialect by dialects.ts; sentinel strings never contain spaces so
//      stream chunking cannot split them.

import { USAGE } from "./sentinels";
import { profileReportsCache, type Dialect, type ResponseVariant, type SemanticFinish, type UsageProfile } from "./dialects";
import type { Surface } from "./client-requests";

export const UPSTREAM_TEXT = "SIM-UPSTREAM-TEXT-0001 the forecast is clear";
export const UPSTREAM_REASONING = "SIM-UPSTREAM-REASONING-0001 check the tool output first";
export const UPSTREAM_SIGNATURE = "SIM-UPSTREAM-SIGNATURE-0001";
export const UPSTREAM_ENCRYPTED = "SIM-UPSTREAM-ENCRYPTED-0001";
export const UPSTREAM_REDACTED = "SIM-UPSTREAM-REDACTED-0001";
export const UPSTREAM_REFUSAL = "SIM-UPSTREAM-REFUSAL-0001 cannot help with that";

export const UPSTREAM_TOOL_CALLS = [
	{ id: "call_SIM_UP_0001", name: "sim_tool_weather", arguments: { sim_arg_city: "SIM-UP-ARG-Lyon", sim_arg_units: "c", sim_arg_nested: { sim_arg_depth: 3 } } },
	{ id: "call_SIM_UP_0002", name: "sim_tool_search", arguments: { sim_arg_query: "SIM-UP-ARG-query-lyon" } },
];

export const BASIC: ResponseVariant = { id: "text", text: UPSTREAM_TEXT, finish: "stop", usage: "basic" };

export function maxVariant(extraUsage?: Record<string, number>, usageProfile?: UsageProfile): ResponseVariant {
	return {
		id: "max",
		text: UPSTREAM_TEXT,
		reasoning: { text: UPSTREAM_REASONING, signature: UPSTREAM_SIGNATURE, encrypted: UPSTREAM_ENCRYPTED, redacted: UPSTREAM_REDACTED },
		toolCalls: UPSTREAM_TOOL_CALLS,
		finish: "tool_calls",
		annotations: true,
		logprobs: true,
		usage: "max",
		extraUsage,
		usageProfile,
	};
}

export const FINISH_VARIANTS: ResponseVariant[] = (["length", "content_filter", "stop_sequence", "pause_turn"] as SemanticFinish[]).map((finish) => ({
	id: `finish:${finish}`,
	text: UPSTREAM_TEXT,
	finish,
	usage: "basic",
}));

export const REFUSAL_VARIANT: ResponseVariant = { id: "finish:refusal", refusal: UPSTREAM_REFUSAL, finish: "refusal", usage: "basic" };

export const ERROR_VARIANTS: ResponseVariant[] = [
	{ id: "error:400", finish: "stop", usage: "basic", error: { status: 400, kind: "bad_request" } },
	{ id: "error:401", finish: "stop", usage: "basic", error: { status: 401, kind: "auth" } },
	{ id: "error:413-context", finish: "stop", usage: "basic", error: { status: 400, kind: "context_length" } },
	{ id: "error:429", finish: "stop", usage: "basic", error: { status: 429, kind: "rate_limit" } },
	{ id: "error:500", finish: "stop", usage: "basic", error: { status: 500, kind: "server" } },
	{ id: "error:529", finish: "stop", usage: "basic", error: { status: 529, kind: "overloaded" } },
	{ id: "error:mid-stream", finish: "stop", usage: "basic", error: { status: 200, kind: "mid_stream" } },
];

/** What a client should receive for a semantic finish, per surface. null = no single correct value. */
export const EXPECTED_FINISH: Record<Surface, Partial<Record<SemanticFinish, string[]>>> = {
	chat: { stop: ["stop"], length: ["length"], tool_calls: ["tool_calls"], content_filter: ["content_filter"], stop_sequence: ["stop"], refusal: ["stop", "content_filter"] },
	responses: { stop: ["completed"], length: ["incomplete:max_output_tokens", "length"], tool_calls: ["completed", "tool_calls"], content_filter: ["incomplete:content_filter", "content_filter"], stop_sequence: ["completed", "stop"] },
	messages: { stop: ["end_turn"], length: ["max_tokens"], tool_calls: ["tool_use"], content_filter: ["refusal"], stop_sequence: ["stop_sequence"], refusal: ["refusal"], pause_turn: ["pause_turn"] },
};

/** Sentinels whose presence in the client output proves a field survived, with the dialects that carry them. */
export const RESPONSE_SENTINELS: Array<{ id: string; value: string; dialects?: Dialect[]; note?: string }> = [
	{ id: "text", value: "SIM-UPSTREAM-TEXT-0001" },
	{ id: "reasoning_text", value: "SIM-UPSTREAM-REASONING-0001" },
	{ id: "reasoning_signature", value: UPSTREAM_SIGNATURE, dialects: ["anthropic-messages", "gemini", "gemini-interactions"] },
	{ id: "reasoning_encrypted", value: UPSTREAM_ENCRYPTED, dialects: ["openai-responses"] },
	{ id: "redacted_thinking", value: UPSTREAM_REDACTED, dialects: ["anthropic-messages"] },
	{ id: "gemini_function_call_signature", value: "SIM-UPSTREAM-FC-SIGNATURE-0001", dialects: ["gemini"] },
	{ id: "tool_call_id_1", value: "call_SIM_UP_0001" },
	{ id: "tool_call_id_2", value: "call_SIM_UP_0002" },
	{ id: "tool_call_args", value: "SIM-UP-ARG-Lyon" },
	{ id: "tool_call_args_2", value: "SIM-UP-ARG-query-lyon" },
	{ id: "citation_url", value: "https://sim.example/cite-0001" },
	{ id: "citation_title", value: "SIM-CITATION-TITLE-0001" },
	{ id: "native_response_id", value: "SIM-UPSTREAM", note: "any of the upstream ids, surfaced as nativeResponseId" },
	{ id: "system_fingerprint", value: "fp_SIM_0001", dialects: ["openai-chat"] },
];

/**
 * Expected billable totals for the "max" usage object, by dialect semantics:
 * OpenAI-style input includes cached reads and writes; Anthropic input excludes both;
 * Gemini prompt includes cached content, and tool-use prompt tokens are extra input.
 */
export function expectedBilling(dialect: Dialect, profile: UsageProfile): { uncachedInput: number; cachedRead: number; cacheWrite: number; output: number } {
	switch (dialect) {
		case "anthropic-messages":
			return { uncachedInput: USAGE.input, cachedRead: USAGE.cachedRead, cacheWrite: USAGE.cacheWrite5m + USAGE.cacheWrite1h, output: USAGE.output };
		case "gemini":
		case "gemini-interactions":
			return { uncachedInput: USAGE.input - USAGE.cachedRead + USAGE.toolUsePrompt, cachedRead: USAGE.cachedRead, cacheWrite: 0, output: USAGE.output };
		default: {
			const read = profileReportsCache(profile) ? USAGE.cachedRead : 0;
			const write = profile.cacheWrite ? USAGE.cacheWrite : 0;
			return { uncachedInput: USAGE.input - read - write, cachedRead: read, cacheWrite: write, output: USAGE.output };
		}
	}
}

/** Success values that must not appear when the upstream stream ended in an error. */
export const SUCCESS_FINISH = new Set(["stop", "length", "tool_calls", "end_turn", "max_tokens", "tool_use", "completed", "stop_sequence"]);
