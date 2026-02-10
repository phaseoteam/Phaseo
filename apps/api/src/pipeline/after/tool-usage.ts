// Purpose: Tool usage extraction helpers for audit/observability.
// Why: We need consistent metrics for requested tools and emitted tool calls.
// How: Parse request/response/IR payloads and attach normalized counters to usage.

type ToolUsageMetrics = {
	request_tool_count?: number | null;
	request_tool_result_count?: number | null;
	output_tool_call_count?: number | null;
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

	return {
		request_tool_count: requested > 0 ? requested : null,
		request_tool_result_count: requestToolResults > 0 ? requestToolResults : null,
		output_tool_call_count: emitted > 0 ? emitted : null,
	};
}

export function attachToolUsageMetrics(usage: any, metrics: ToolUsageMetrics): any {
	const base = usage && typeof usage === "object" ? { ...usage } : {};
	const requestedExisting = Number(base.request_tool_count ?? base.requested_tool_count ?? 0);
	const requestToolResultsExisting = Number(base.request_tool_result_count ?? base.tool_result_count ?? 0);
	const emittedExisting = Number(base.output_tool_call_count ?? base.tool_call_count ?? 0);

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

	return base;
}

export type { ToolUsageMetrics };
