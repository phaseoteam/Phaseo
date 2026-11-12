import { describe, expect, it } from "vitest";
import { hasUsableIRChatResponse } from "../surfaces/empty-response";
import { applySuccessfulResponseBillingPolicy } from "./billing-policy";
import { isBillableToolCall, usageReportsNonTextOutput } from "./response-output";
import { countOutputToolCallsFromIR, countOutputToolCallsFromPayload } from "./tool-usage";

const placeholder = { id: "", name: "", arguments: "" };
const irWith = (message: Record<string, unknown>) => ({ choices: [{ index: 0, message: { role: "assistant", content: [], ...message } }] }) as any;

describe("response output", () => {
	it("counts a tool call only when it names a tool or carries arguments", () => {
		expect(isBillableToolCall(placeholder)).toBe(false);
		expect(isBillableToolCall({ id: "c1", name: "lookup", arguments: "" })).toBe(true);
		expect(isBillableToolCall({ id: "c1", name: "", arguments: "{\"q\":1}" })).toBe(true);
		expect(isBillableToolCall({ type: "function", function: { name: "lookup", arguments: "" } })).toBe(true);
		expect(isBillableToolCall({ type: "tool_use", name: "", input: { q: 1 } })).toBe(true);
		expect(countOutputToolCallsFromIR(irWith({ toolCalls: [placeholder] }))).toBe(0);
		expect(countOutputToolCallsFromPayload({ choices: [{ message: { tool_calls: [{ id: "", function: { name: "", arguments: "" } }] } }] })).toBe(0);
		expect(countOutputToolCallsFromPayload({ output: [{ type: "function_call", name: "", arguments: "" }] })).toBe(0);
		expect(countOutputToolCallsFromPayload({ content: [{ type: "tool_use", name: "", input: {} }] })).toBe(0);
	});

	it("treats a response whose only output is a placeholder tool call as empty", () => {
		expect(hasUsableIRChatResponse(irWith({ toolCalls: [placeholder] }))).toBe(false);
		expect(hasUsableIRChatResponse(irWith({ toolCalls: [{ id: "c1", name: "lookup", arguments: "{}" }] }))).toBe(true);
	});

	it.each([
		["nested image tokens", { completion_tokens_details: { image_tokens: 50 } }],
		["nested audio tokens", { output_tokens_details: { audio_tokens: 40 } }],
		["reasoning tokens", { completion_tokens_details: { reasoning_tokens: 30 } }],
		["web search results", { output_web_search_result_count: 2 }],
		["citations", { output_citation_count: 1 }],
		["a tool call", { output_tool_call_count: 1 }],
	])("reports %s as output, so a single response is not waived", (_label, extra) => {
		const usage = { input_tokens: 0, output_tokens: 0, ...extra, pricing: { total_nanos: 1_000_000, lines: [] } };
		expect(usageReportsNonTextOutput(usage)).toBe(true);
		const billed = applySuccessfulResponseBillingPolicy({ endpoint: "chat.completions", pricedUsage: usage, totalNanos: 1_000_000, totalCents: 0 });
		expect(billed).toMatchObject({ billingSuppressed: false, totalNanos: 1_000_000 });
	});

	it("still waives a response with nothing but zero text output and no billable input", () => {
		const usage = { input_tokens: 0, output_tokens: 0, pricing: { total_nanos: 1_000_000, lines: [] } };
		expect(applySuccessfulResponseBillingPolicy({ endpoint: "chat.completions", pricedUsage: usage, totalNanos: 1_000_000, totalCents: 0 }))
			.toMatchObject({ billingSuppressed: true, totalNanos: 0 });
		expect(applySuccessfulResponseBillingPolicy({ endpoint: "chat.completions", pricedUsage: usage, totalNanos: 1_000_000, totalCents: 0, ir: irWith({ toolCalls: [placeholder] }) }))
			.toMatchObject({ billingSuppressed: true });
	});
});
