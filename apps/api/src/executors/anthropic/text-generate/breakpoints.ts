// Purpose: Make every cache breakpoint in an Anthropic Messages request valid.
// Why: Chat and Responses clients can send OpenAI `prompt_cache_breakpoint` marks or
//      Anthropic-style `cache_control` with fields Anthropic rejects, and Anthropic
//      returns 400 for more than four breakpoints.
// How: Runs last in irToAnthropicMessages: rewrites each `cache_control` to
//      `{ type: "ephemeral", ttl? }` and keeps at most four marks.

// Anthropic rejects requests with more than four cache_control breakpoints,
// counting tools, system blocks and message content blocks together.
const MAX_BREAKPOINTS = 4;
const ANTHROPIC_CACHE_TTLS = new Set(["5m", "1h"]);

/**
 * Anthropic's `cache_control` accepts only `type: "ephemeral"` and an optional
 * `ttl` of `5m` or `1h`. An OpenAI `prompt_cache_breakpoint` maps to a plain
 * ephemeral breakpoint; OpenAI's `mode` field has no Anthropic equivalent.
 */
export function toAnthropicCacheControl(value: unknown): { type: "ephemeral"; ttl?: string } | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const ttl = typeof (value as any).ttl === "string" ? (value as any).ttl.trim() : "";
	return ANTHROPIC_CACHE_TTLS.has(ttl) ? { type: "ephemeral", ttl } : { type: "ephemeral" };
}

function collectMarkedBlocks(blocks: unknown, out: any[]): void {
	if (!Array.isArray(blocks)) return;
	for (let index = 0; index < blocks.length; index += 1) {
		const original = blocks[index];
		if (!original || typeof original !== "object") continue;
		const hasMark = "cache_control" in original;
		const nested = original.type === "tool_result" && Array.isArray(original.content);
		if (!hasMark && !nested) continue;
		// Copy first: passthrough blocks can be shared with the IR.
		const block: any = nested ? { ...original, content: [...original.content] } : { ...original };
		blocks[index] = block;
		// Thinking blocks cannot carry cache_control; a client mark on one
		// (for example a replayed Messages block) would be a 400.
		if (hasMark && (block.type === "thinking" || block.type === "redacted_thinking")) {
			delete block.cache_control;
			continue;
		}
		if (hasMark) {
			const next = toAnthropicCacheControl(block.cache_control);
			if (next) {
				block.cache_control = next;
				out.push(block);
			} else {
				delete block.cache_control;
			}
		}
		// Blocks nested inside a tool result can carry their own marks.
		if (nested) collectMarkedBlocks(block.content, out);
	}
}

/**
 * Normalise and cap the request's cache breakpoints in place. When a client
 * sends more than four, keep the first (usually the stable tools or system
 * prefix shared across sessions) and the latest three (the longest reusable
 * conversation prefix), and drop the rest.
 */
export function normaliseAnthropicCacheBreakpoints(request: any): void {
	if (!request || typeof request !== "object") return;
	const marked: any[] = [];
	collectMarkedBlocks(request.tools, marked);
	collectMarkedBlocks(request.system, marked);
	if (Array.isArray(request.messages)) {
		for (const message of request.messages) collectMarkedBlocks(message?.content, marked);
	}
	let kept = marked;
	if (marked.length > MAX_BREAKPOINTS) {
		const keep = new Set([marked[0], ...marked.slice(-(MAX_BREAKPOINTS - 1))]);
		for (const block of marked) {
			if (!keep.has(block)) delete block.cache_control;
		}
		kept = marked.filter((block) => keep.has(block));
	}
	promoteMarksBeforeOneHour(kept);
}

/**
 * Anthropic rejects a 1h breakpoint that follows a 5m one: longer TTLs must come
 * first. A translated OpenAI breakpoint (default 5m) can precede a client's 1h
 * mark, so raise every earlier mark to 1h. The 1h breakpoint already writes that
 * prefix at the 1h rate, so this changes neither what is cached nor the cost.
 */
function promoteMarksBeforeOneHour(marked: any[]): void {
	let laterOneHour = false;
	for (let index = marked.length - 1; index >= 0; index -= 1) {
		const mark = marked[index].cache_control;
		if (mark?.ttl === "1h") laterOneHour = true;
		else if (laterOneHour && mark) mark.ttl = "1h";
	}
}
