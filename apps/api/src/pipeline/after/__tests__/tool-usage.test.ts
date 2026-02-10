import { describe, expect, it } from "vitest";
import {
	attachToolUsageMetrics,
	countOutputToolCallsFromPayload,
	countRequestedToolResults,
	countRequestedTools,
	summarizeToolUsage,
} from "../tool-usage";

describe("tool usage helpers", () => {
	it("counts requested tools from request body", () => {
		expect(countRequestedTools({ tools: [{}, {}] })).toBe(2);
		expect(countRequestedTools({})).toBe(0);
	});

	it("counts request tool results across surfaces", () => {
		expect(
			countRequestedToolResults({
				messages: [
					{ role: "tool", content: "ok" },
					{
						role: "user",
						content: [{ type: "tool_result", tool_use_id: "abc", content: "done" }],
					},
				],
				input: [{ type: "function_call_output", call_id: "c1", output: "ok" }],
			}),
		).toBe(3);
	});

	it("counts emitted tool calls from responses payload", () => {
		const payload = {
			output: [
				{ type: "message" },
				{ type: "function_call", name: "weather" },
				{ type: "tool_call", name: "news" },
			],
		};
		expect(countOutputToolCallsFromPayload(payload)).toBe(2);
	});

	it("summarizes request and output tool usage from mixed inputs", () => {
		const metrics = summarizeToolUsage({
			body: {
				tools: [{}, {}, {}],
				input: [{ type: "function_call_output", call_id: "1", output: "ok" }],
			},
			ir: {
				messages: [{
					role: "tool",
					toolResults: [{ toolCallId: "1", content: "ok" }],
				}],
				choices: [{
					message: {
						toolCalls: [{ id: "1" }, { id: "2" }],
					},
				}],
			},
		});
		expect(metrics.request_tool_count).toBe(3);
		expect(metrics.request_tool_result_count).toBe(1);
		expect(metrics.output_tool_call_count).toBe(2);
	});

	it("attaches metrics without overriding existing populated values", () => {
		const usage = attachToolUsageMetrics(
			{ output_tool_call_count: 4, request_tool_result_count: 9 },
			{ request_tool_count: 2, request_tool_result_count: 1, output_tool_call_count: 1 },
		);
		expect(usage.request_tool_count).toBe(2);
		expect(usage.request_tool_result_count).toBe(9);
		expect(usage.tool_result_count).toBe(9);
		expect(usage.output_tool_call_count).toBe(4);
		expect(usage.tool_call_count).toBe(4);
	});
});
