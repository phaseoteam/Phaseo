import { describe, expect, it } from "vitest";
import {
	attachToolUsageMetrics,
	collectOutputToolCallNamesFromPayload,
	collectRequestedToolNames,
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

	it("collects requested tool names from server and function tool definitions", () => {
		expect(
			collectRequestedToolNames({
				tools: [
					{ type: "gateway:datetime" },
					{ type: "function", function: { name: "client_lookup" } },
					{ type: "function", function: { name: "client_lookup" } },
				],
			}),
		).toEqual(["gateway:datetime", "client_lookup"]);
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
		expect(countOutputToolCallsFromPayload(payload)).toBe(1);
	});

	it("collects emitted tool call names from response payloads", () => {
		expect(
			collectOutputToolCallNamesFromPayload({
				output: [
					{ type: "function_call", name: "gateway_datetime" },
					{ type: "function_call", name: "talk" },
					{ type: "message" },
				],
			}),
		).toEqual(["gateway_datetime", "talk"]);
	});

	it("summarizes request and output tool usage from mixed inputs", () => {
		const metrics = summarizeToolUsage({
			body: {
				tools: [
					{ type: "gateway:datetime" },
					{ type: "function", function: { name: "client_lookup" } },
					{},
				],
				input: [{ type: "function_call_output", call_id: "1", output: "ok" }],
			},
			ir: {
				messages: [{
					role: "tool",
					toolResults: [{ toolCallId: "1", content: "ok" }],
				}],
				choices: [{
					message: {
						toolCalls: [
							{ id: "1", name: "gateway_datetime" },
							{ id: "2", name: "talk" },
						],
					},
				}],
			},
		});
		expect(metrics.request_tool_count).toBe(3);
		expect(metrics.request_tool_result_count).toBe(1);
		expect(metrics.output_tool_call_count).toBe(2);
		expect(metrics.request_tool_names).toEqual(["gateway:datetime", "client_lookup"]);
		expect(metrics.output_tool_call_names).toEqual(["gateway_datetime", "talk"]);
	});

	it("counts grounding metadata web results and citations for provider-native search outputs", () => {
		const metrics = summarizeToolUsage({
			payload: {
				candidates: [
					{
						groundingMetadata: {
							groundingChunks: [
								{
									web: {
										uri: "https://example.com/docs",
										title: "AI Stats Docs",
									},
								},
								{
									web: {
										uri: "https://example.com/blog",
										title: "AI Stats Blog",
									},
								},
							],
							groundingSupports: [
								{
									segment: {
										text: "Grounded answer segment",
									},
									groundingChunkIndices: [0, 1],
								},
							],
						},
					},
				],
			},
		});

		expect(metrics.output_web_search_result_count).toBe(2);
		expect(metrics.output_citation_count).toBe(2);
	});

	it("attaches metrics without overriding existing populated values", () => {
		const usage = attachToolUsageMetrics(
			{ output_tool_call_count: 4, request_tool_result_count: 9 },
			{
				request_tool_count: 2,
				request_tool_result_count: 1,
				output_tool_call_count: 1,
				request_tool_names: ["gateway:datetime"],
				output_tool_call_names: ["talk"],
			},
		);
		expect(usage.request_tool_count).toBe(2);
		expect(usage.request_tool_names).toEqual(["gateway:datetime"]);
		expect(usage.request_tool_result_count).toBe(9);
		expect(usage.tool_result_count).toBe(9);
		expect(usage.output_tool_call_count).toBe(4);
		expect(usage.tool_call_count).toBe(4);
		expect(usage.output_tool_call_names).toEqual(["talk"]);
	});
});
