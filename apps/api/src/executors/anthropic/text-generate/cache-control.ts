// Default Anthropic prompt-cache breakpoints for provider_options.anthropic.cache_control.
// Shared by the Anthropic, Amazon Bedrock and Google Vertex AI executors through irToAnthropicMessages.

export function normalizeAnthropicCacheControlValue(value: unknown): Record<string, any> | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const next: Record<string, any> = { ...(value as Record<string, any>) };
	delete next.scope;
	if (typeof next.type === "string") next.type = next.type.trim();
	if (typeof next.ttl === "string") next.ttl = next.ttl.trim();
	for (const key of Object.keys(next)) {
		if (next[key] === undefined || next[key] === null || next[key] === "") delete next[key];
	}
	return Object.keys(next).length > 0 ? next : undefined;
}

// Anthropic rejects requests with more than four cache_control breakpoints,
// counting tools, system blocks and message content blocks together.
export const ANTHROPIC_MAX_CACHE_BREAKPOINTS = 4;
// Message blocks that accept cache_control. Thinking and redacted thinking
// blocks cannot be marked, and unknown passthrough blocks are left alone.
const ANTHROPIC_CACHEABLE_MESSAGE_BLOCK_TYPES = new Set([
	"text",
	"image",
	"document",
	"search_result",
	"tool_use",
	"tool_result",
]);
const ANTHROPIC_TEXT_CACHE_BLOCK_TYPES = new Set(["text", "image"]);
const ALL_TEXT_MAX_USER_MESSAGES = 3;

export type AnthropicCacheScope = "all_text" | "last_user_message" | "agent" | "none";

/**
 * Resolve the gateway cache scope. No scope keeps the historical `all_text`
 * default. Unknown scopes use the bounded `agent` placement rather than
 * marking every message: the caller still opted into caching, and `agent`
 * can never exceed Anthropic's breakpoint limit.
 */
export function resolveAnthropicCacheScope(control: unknown): AnthropicCacheScope {
	const raw = typeof (control as any)?.scope === "string"
		? (control as any).scope.trim().toLowerCase()
		: "";
	if (!raw || raw === "all_text") return "all_text";
	if (raw === "none" || raw === "last_user_message") return raw;
	return "agent";
}

function hasCacheControl(block: unknown): boolean {
	const value = (block as any)?.cache_control;
	return Boolean(value) && typeof value === "object";
}

function isCacheableMessageBlock(block: any, allowedTypes: Set<string>): boolean {
	if (!block || typeof block !== "object") return false;
	if (!allowedTypes.has(block.type)) return false;
	// Anthropic rejects cache_control on empty text blocks.
	if (block.type === "text" && (typeof block.text !== "string" || block.text.length === 0)) return false;
	return true;
}

export function countAnthropicCacheBreakpoints(request: any): number {
	let count = 0;
	const countBlocks = (blocks: unknown) => {
		if (!Array.isArray(blocks)) return;
		for (const block of blocks) {
			if (!block || typeof block !== "object") continue;
			if (hasCacheControl(block)) count += 1;
			// Blocks nested inside a tool result can carry their own marks.
			if ((block as any).type === "tool_result") countBlocks((block as any).content);
		}
	};
	countBlocks(request?.tools);
	countBlocks(request?.system);
	if (Array.isArray(request?.messages)) {
		for (const msg of request.messages) countBlocks(msg?.content);
	}
	return count;
}

/** Last block in the given messages that may carry cache_control, newest first. */
function findLastCacheableBlock(messages: any[], allowedTypes: Set<string>): any | undefined {
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		const content = messages[i]?.content;
		if (!Array.isArray(content)) continue;
		for (let j = content.length - 1; j >= 0; j -= 1) {
			if (isCacheableMessageBlock(content[j], allowedTypes)) return content[j];
		}
	}
	return undefined;
}

/** Group consecutive same-role messages, which Anthropic merges into one turn. */
function groupMessagesByRole(messages: any[]): any[][] {
	const runs: any[][] = [];
	for (const msg of messages) {
		const current = runs[runs.length - 1];
		if (current && current[0]?.role === msg?.role) current.push(msg);
		else runs.push([msg]);
	}
	return runs;
}

function createCacheMarker(request: any, cacheControl: Record<string, any>) {
	let budget = Math.max(0, ANTHROPIC_MAX_CACHE_BREAKPOINTS - countAnthropicCacheBreakpoints(request));
	return {
		get budget() {
			return budget;
		},
		/** Returns true when the target carries a breakpoint afterwards. */
		mark(target: any): boolean {
			if (!target || typeof target !== "object") return false;
			if (hasCacheControl(target)) return true;
			if (budget <= 0) return false;
			target.cache_control = { ...cacheControl };
			budget -= 1;
			return true;
		},
	};
}

function markSystem(request: any, marker: ReturnType<typeof createCacheMarker>): void {
	if (typeof request.system === "string") {
		if (request.system.trim().length === 0) return;
		// Only switch to the block form when a breakpoint is actually applied.
		const block = { type: "text", text: request.system };
		if (marker.mark(block)) request.system = [block];
		return;
	}
	if (!Array.isArray(request.system)) return;
	for (let i = request.system.length - 1; i >= 0; i -= 1) {
		if (!isCacheableMessageBlock(request.system[i], ANTHROPIC_TEXT_CACHE_BLOCK_TYPES)) continue;
		marker.mark(request.system[i]);
		return;
	}
}

function lastToolCacheTarget(request: any): any | undefined {
	if (!Array.isArray(request.tools)) return undefined;
	for (let i = request.tools.length - 1; i >= 0; i -= 1) {
		const tool = request.tools[i];
		if (!tool || typeof tool !== "object") continue;
		// Deferred tools are loaded on demand and are not part of the cached prefix.
		if (tool.defer_loading === true) continue;
		return tool;
	}
	return undefined;
}

export function applyAnthropicCacheControlDefaults(
	request: any,
	control: unknown,
): void {
	const scope = resolveAnthropicCacheScope(control);
	if (scope === "none") return;

	const cacheControl = normalizeAnthropicCacheControlValue(control);
	if (!cacheControl) return;

	const messages: any[] = Array.isArray(request.messages) ? request.messages : [];
	const marker = createCacheMarker(request, cacheControl);

	if (scope === "last_user_message") {
		// Unchanged target: the newest user message, text and image blocks only.
		// One breakpoint on its last eligible block caches everything before it.
		for (let i = messages.length - 1; i >= 0; i -= 1) {
			if (messages[i]?.role !== "user") continue;
			marker.mark(findLastCacheableBlock([messages[i]], ANTHROPIC_TEXT_CACHE_BLOCK_TYPES));
			break;
		}
		return;
	}

	if (scope === "all_text") {
		markSystem(request, marker);
		let handled = 0;
		for (let i = messages.length - 1; i >= 0; i -= 1) {
			if (handled >= ALL_TEXT_MAX_USER_MESSAGES || marker.budget <= 0) break;
			if (messages[i]?.role !== "user") continue;
			const target = findLastCacheableBlock([messages[i]], ANTHROPIC_TEXT_CACHE_BLOCK_TYPES);
			if (!target) continue;
			marker.mark(target);
			handled += 1;
		}
		return;
	}

	// agent: tools, system, the newest turn and the previous step's turn,
	// with the newest turn first so a tight budget still caches the whole prefix.
	const runs = groupMessagesByRole(messages);
	const finalRun = runs[runs.length - 1];
	if (finalRun) marker.mark(findLastCacheableBlock(finalRun, ANTHROPIC_CACHEABLE_MESSAGE_BLOCK_TYPES));
	markSystem(request, marker);
	marker.mark(lastToolCacheTarget(request));
	const previousStepRun = runs[runs.length - 3];
	if (previousStepRun) marker.mark(findLastCacheableBlock(previousStepRun, ANTHROPIC_CACHEABLE_MESSAGE_BLOCK_TYPES));
}
