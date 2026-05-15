// Purpose: Tool usage extraction helpers for audit/observability.
// Why: We need consistent metrics for requested tools and emitted tool calls.
// How: Parse request/response/IR payloads and attach normalized counters to usage.

import {
	extractToolNameOrType,
	isNativeWebSearchTool,
	isNativeWebSearchToolType,
} from "@core/nativeTools";

type ToolUsageMetrics = {
	request_tool_count?: number | null;
	request_tool_result_count?: number | null;
	output_tool_call_count?: number | null;
	requested_native_web_search_tools?: number | null;
	output_web_search_result_count?: number | null;
	output_citation_count?: number | null;
};

export function countRequestedTools(body: any): number {
	if (!body || typeof body !== "object") return 0;
	const tools = Array.isArray(body.tools) ? body.tools : [];
	return tools.length;
}

export function countRequestedToolResults(body: any): number {
	if (!body || typeof body !== "object") return 0;
	let total = 0;

	// Chat Completions style: messages[].role === "tool"
	if (Array.isArray(body.messages)) {
		for (const msg of body.messages) {
			if (!msg || typeof msg !== "object") continue;
			if (String(msg.role ?? "").toLowerCase() === "tool") {
				total += 1;
				continue;
			}

			// Anthropic style (when proxied): user content blocks include tool_result blocks.
			const content = (msg as any).content;
			if (Array.isArray(content)) {
				for (const block of content) {
					if (String(block?.type ?? "").toLowerCase() === "tool_result") {
						total += 1;
					}
				}
			}
		}
	}

	// Responses style: input/input_items may include function_call_output entries.
	const inputItems = Array.isArray(body.input_items)
		? body.input_items
		: (Array.isArray(body.input) ? body.input : []);
	for (const item of inputItems) {
		if (!item || typeof item !== "object") continue;
		const type = String(item.type ?? "").toLowerCase();
		if (type === "function_call_output" || type === "tool_result") {
			total += 1;
			continue;
		}
		if (type === "message" && String(item.role ?? "").toLowerCase() === "tool") {
			total += 1;
		}
	}

	return total;
}

export function countRequestedNativeWebSearchTools(body: any): number {
	if (!body || typeof body !== "object") return 0;
	let total = 0;

	const tools = Array.isArray(body.tools) ? body.tools : [];
	for (const tool of tools) {
		if (isNativeWebSearchTool(tool)) total += 1;
	}

	const toolChoice = body.tool_choice;
	if (typeof toolChoice === "string") {
		if (isNativeWebSearchToolType(toolChoice)) total += 1;
	} else if (toolChoice && typeof toolChoice === "object") {
		const selected = extractToolNameOrType(toolChoice);
		if (isNativeWebSearchToolType(selected)) total += 1;
	}

	return total;
}

function countFromChatLikePayload(payload: any): number {
	if (!payload || typeof payload !== "object" || !Array.isArray(payload.choices)) return 0;
	let total = 0;
	for (const choice of payload.choices) {
		const messageCalls = Array.isArray(choice?.message?.tool_calls) ? choice.message.tool_calls.length : 0;
		const deltaCalls = Array.isArray(choice?.delta?.tool_calls) ? choice.delta.tool_calls.length : 0;
		total += Math.max(messageCalls, deltaCalls);
	}
	return total;
}

function countFromResponsesPayload(payload: any): number {
	if (!payload || typeof payload !== "object") return 0;
	const items = Array.isArray(payload.output)
		? payload.output
		: (Array.isArray(payload.output_items) ? payload.output_items : []);
	let total = 0;
	for (const item of items) {
		const type = String(item?.type ?? "").toLowerCase();
		if (type === "function_call" || type === "tool_call") total += 1;
	}
	return total;
}

function countFromAnthropicPayload(payload: any): number {
	if (!payload || typeof payload !== "object" || !Array.isArray(payload.content)) return 0;
	let total = 0;
	for (const block of payload.content) {
		if (String(block?.type ?? "").toLowerCase() === "tool_use") total += 1;
	}
	return total;
}

export function countOutputToolCallsFromPayload(payload: any): number {
	if (!payload || typeof payload !== "object") return 0;
	return Math.max(
		countFromChatLikePayload(payload),
		countFromResponsesPayload(payload),
		countFromAnthropicPayload(payload),
	);
}

export function countOutputToolCallsFromIR(ir: any): number {
	if (!ir || typeof ir !== "object" || !Array.isArray(ir.choices)) return 0;
	let total = 0;
	for (const choice of ir.choices) {
		const calls = Array.isArray(choice?.message?.toolCalls) ? choice.message.toolCalls.length : 0;
		total += calls;
	}
	return total;
}

function countMatchingNodes(value: any, predicate: (node: any) => boolean): number {
	if (value == null) return 0;
	if (Array.isArray(value)) return value.reduce((sum, item) => sum + countMatchingNodes(item, predicate), 0);
	if (typeof value !== "object") return 0;

	let total = predicate(value) ? 1 : 0;
	for (const child of Object.values(value)) {
		total += countMatchingNodes(child, predicate);
	}
	return total;
}

function countMatchingArrayEntries(
	value: any,
	selector: (node: any) => any[],
	predicate: (entry: any) => boolean,
): number {
	if (value == null) return 0;
	if (Array.isArray(value)) {
		return value.reduce(
			(sum, item) => sum + countMatchingArrayEntries(item, selector, predicate),
			0,
		);
	}
	if (typeof value !== "object") return 0;

	const selected = selector(value);
	const localCount = Array.isArray(selected)
		? selected.filter((entry) => predicate(entry)).length
		: 0;
	let nestedCount = 0;
	for (const child of Object.values(value)) {
		nestedCount += countMatchingArrayEntries(child, selector, predicate);
	}
	return localCount + nestedCount;
}

function sumMatchingArrayEntries(
	value: any,
	selector: (node: any) => any[],
	mapper: (entry: any) => number,
): number {
	if (value == null) return 0;
	if (Array.isArray(value)) {
		return value.reduce(
			(sum, item) => sum + sumMatchingArrayEntries(item, selector, mapper),
			0,
		);
	}
	if (typeof value !== "object") return 0;

	const selected = selector(value);
	const localCount = Array.isArray(selected)
		? selected.reduce((sum, entry) => sum + mapper(entry), 0)
		: 0;
	let nestedCount = 0;
	for (const child of Object.values(value)) {
		nestedCount += sumMatchingArrayEntries(child, selector, mapper);
	}
	return localCount + nestedCount;
}

export function countOutputWebSearchResults(args: { ir?: any; payload?: any }): number {
	const predicate = (node: any) => {
		const type = String(node?.type ?? "").toLowerCase();
		return type === "web_search_result" || type === "web_search_tool_result";
	};
	const groundingChunkSelector = (node: any) =>
		Array.isArray(node?.groundingChunks)
			? node.groundingChunks
			: (Array.isArray(node?.grounding_chunks) ? node.grounding_chunks : []);
	const groundingChunkPredicate = (entry: any) => {
		const web = entry?.web ?? null;
		const retrievedContext = entry?.retrievedContext ?? entry?.retrieved_context ?? null;
		return Boolean(
			(web && typeof web === "object" && (web.uri || web.url || web.title)) ||
			(retrievedContext &&
				typeof retrievedContext === "object" &&
				(retrievedContext.uri || retrievedContext.url || retrievedContext.title)),
		);
	};
	return Math.max(
		countMatchingNodes(args.ir, predicate) +
			countMatchingArrayEntries(args.ir, groundingChunkSelector, groundingChunkPredicate),
		countMatchingNodes(args.payload, predicate) +
			countMatchingArrayEntries(args.payload, groundingChunkSelector, groundingChunkPredicate),
	);
}

export function countOutputCitations(args: { ir?: any; payload?: any }): number {
	const countCitations = (value: any): number => {
		if (value == null) return 0;
		if (Array.isArray(value)) return value.reduce((sum, item) => sum + countCitations(item), 0);
		if (typeof value !== "object") return 0;

		let total = 0;
		if (Array.isArray((value as any).citations)) total += (value as any).citations.length;
		if (Array.isArray((value as any).annotations)) total += (value as any).annotations.length;
		for (const child of Object.values(value)) {
			total += countCitations(child);
		}
		return total;
	};
	const groundingSupportSelector = (node: any) =>
		Array.isArray(node?.groundingSupports)
			? node.groundingSupports
			: (Array.isArray(node?.grounding_supports) ? node.grounding_supports : []);
	const groundingSupportCount = (entry: any) => {
		const indices = Array.isArray(entry?.groundingChunkIndices)
			? entry.groundingChunkIndices
			: (Array.isArray(entry?.grounding_chunk_indices) ? entry.grounding_chunk_indices : []);
		const segment = entry?.segment ?? null;
		if (indices.length > 0) return indices.length;
		return segment?.text || entry?.text || entry?.segment_text ? 1 : 0;
	};

	return Math.max(
		countCitations(args.ir) +
			sumMatchingArrayEntries(args.ir, groundingSupportSelector, groundingSupportCount),
		countCitations(args.payload) +
			sumMatchingArrayEntries(args.payload, groundingSupportSelector, groundingSupportCount),
	);
}

export function countToolResultsFromIR(ir: any): number {
	if (!ir || typeof ir !== "object" || !Array.isArray(ir.messages)) return 0;
	let total = 0;
	for (const message of ir.messages) {
		if (!message || typeof message !== "object") continue;
		if (String(message.role ?? "").toLowerCase() !== "tool") continue;
		const results = Array.isArray((message as any).toolResults)
			? (message as any).toolResults
			: [];
		total += Math.max(1, results.length);
	}
	return total;
}

export function summarizeToolUsage(args: {
	body?: any;
	ir?: any;
	payload?: any;
}): ToolUsageMetrics {
	const requested = countRequestedTools(args.body);
	const requestToolResultsFromBody = countRequestedToolResults(args.body);
	const requestToolResultsFromIr = countToolResultsFromIR(args.ir);
	const requestToolResults = Math.max(requestToolResultsFromBody, requestToolResultsFromIr);
	const emittedFromIr = countOutputToolCallsFromIR(args.ir);
	const emittedFromPayload = countOutputToolCallsFromPayload(args.payload);
	const emitted = Math.max(emittedFromIr, emittedFromPayload);
	const requestedNativeWebSearchTools = countRequestedNativeWebSearchTools(args.body);
	const outputWebSearchResults = countOutputWebSearchResults(args);
	const outputCitations = countOutputCitations(args);

	return {
		request_tool_count: requested > 0 ? requested : null,
		request_tool_result_count: requestToolResults > 0 ? requestToolResults : null,
		output_tool_call_count: emitted > 0 ? emitted : null,
		requested_native_web_search_tools:
			requestedNativeWebSearchTools > 0 ? requestedNativeWebSearchTools : null,
		output_web_search_result_count: outputWebSearchResults > 0 ? outputWebSearchResults : null,
		output_citation_count: outputCitations > 0 ? outputCitations : null,
	};
}

export function attachToolUsageMetrics(usage: any, metrics: ToolUsageMetrics): any {
	const base = usage && typeof usage === "object" ? { ...usage } : {};
	const requestedExisting = Number(base.request_tool_count ?? base.requested_tool_count ?? 0);
	const requestToolResultsExisting = Number(base.request_tool_result_count ?? base.tool_result_count ?? 0);
	const emittedExisting = Number(base.output_tool_call_count ?? base.tool_call_count ?? 0);
	const requestedNativeWebSearchExisting = Number(
		base.requested_native_web_search_tools ?? base.native_web_search_tool_count ?? 0,
	);
	const outputWebSearchResultsExisting = Number(
		base.output_web_search_result_count ?? base.web_search_result_count ?? 0,
	);
	const outputCitationsExisting = Number(base.output_citation_count ?? base.citation_count ?? 0);

	const requestedResolved =
		Number.isFinite(requestedExisting) && requestedExisting > 0
			? requestedExisting
			: Number(metrics.request_tool_count ?? 0);
	const requestToolResultsResolved =
		Number.isFinite(requestToolResultsExisting) && requestToolResultsExisting > 0
			? requestToolResultsExisting
			: Number(metrics.request_tool_result_count ?? 0);
	const emittedResolved =
		Number.isFinite(emittedExisting) && emittedExisting > 0
			? emittedExisting
			: Number(metrics.output_tool_call_count ?? 0);
	const requestedNativeWebSearchResolved =
		Number.isFinite(requestedNativeWebSearchExisting) && requestedNativeWebSearchExisting > 0
			? requestedNativeWebSearchExisting
			: Number(metrics.requested_native_web_search_tools ?? 0);
	const outputWebSearchResultsResolved =
		Number.isFinite(outputWebSearchResultsExisting) && outputWebSearchResultsExisting > 0
			? outputWebSearchResultsExisting
			: Number(metrics.output_web_search_result_count ?? 0);
	const outputCitationsResolved =
		Number.isFinite(outputCitationsExisting) && outputCitationsExisting > 0
			? outputCitationsExisting
			: Number(metrics.output_citation_count ?? 0);

	if (requestedResolved > 0) base.request_tool_count = requestedResolved;
	if (requestToolResultsResolved > 0) {
		base.request_tool_result_count = requestToolResultsResolved;
		// Alias for compatibility with other consumers.
		if (base.tool_result_count == null) base.tool_result_count = requestToolResultsResolved;
	}
	if (emittedResolved > 0) {
		base.output_tool_call_count = emittedResolved;
		// Alias for compatibility with other consumers.
		if (base.tool_call_count == null) base.tool_call_count = emittedResolved;
	}
	if (requestedNativeWebSearchResolved > 0) {
		base.requested_native_web_search_tools = requestedNativeWebSearchResolved;
		if (base.native_web_search_tool_count == null) {
			base.native_web_search_tool_count = requestedNativeWebSearchResolved;
		}
	}
	if (outputWebSearchResultsResolved > 0) {
		base.output_web_search_result_count = outputWebSearchResultsResolved;
		if (base.web_search_result_count == null) {
			base.web_search_result_count = outputWebSearchResultsResolved;
		}
	}
	if (outputCitationsResolved > 0) {
		base.output_citation_count = outputCitationsResolved;
		if (base.citation_count == null) base.citation_count = outputCitationsResolved;
	}

	return base;
}

export type { ToolUsageMetrics };
