import { describe, expect, it } from "vitest";
import { extractUnifiedStreamEvents } from "./stream-events";

describe("extractUnifiedStreamEvents", () => {
	it("extracts text, reasoning, and tool deltas from chat completion chunks", () => {
		const events = extractUnifiedStreamEvents({
			protocol: "openai.chat.completions",
			frame: {
				object: "chat.completion.chunk",
				choices: [
					{
						index: 0,
						delta: {
							content: "hello",
							reasoning_content: "think",
							tool_calls: [
								{
									index: 1,
									id: "call_1",
									function: { name: "lookup", arguments: "{\"q\":\"x\"}" },
								},
							],
						},
						finish_reason: null,
					},
				],
			},
		});

		expect(events.some((event) => event.type === "start")).toBe(true);
		expect(
			events.some(
				(event) =>
					event.type === "delta_text" &&
					event.channel === "output_text" &&
					event.text === "hello",
			),
		).toBe(true);
		expect(
			events.some(
				(event) =>
					event.type === "delta_text" &&
					event.channel === "reasoning_text" &&
					event.text === "think",
			),
		).toBe(true);
		expect(
			events.some(
				(event) =>
					event.type === "delta_tool" &&
					event.toolCallId === "call_1" &&
					event.toolName === "lookup",
			),
		).toBe(true);
	});

	it("extracts usage and stop from final chat completion snapshot", () => {
		const events = extractUnifiedStreamEvents({
			protocol: "openai.chat.completions",
			frame: {
				object: "chat.completion",
				usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
				choices: [{ finish_reason: "stop" }],
			},
		});

		expect(
			events.some(
				(event) =>
					event.type === "snapshot" && event.isFinal === true,
			),
		).toBe(true);
		expect(events.some((event) => event.type === "usage")).toBe(true);
		expect(
			events.some(
				(event) => event.type === "stop" && event.finishReason === "stop",
			),
		).toBe(true);
	});

	it("extracts responses protocol deltas and completion", () => {
		const deltaEvents = extractUnifiedStreamEvents({
			protocol: "openai.responses",
			eventName: "response.output_text.delta",
			frame: { delta: "abc", output_index: 0 },
		});
		expect(
			deltaEvents.some(
				(event) =>
					event.type === "delta_text" &&
					event.channel === "output_text" &&
					event.text === "abc",
			),
		).toBe(true);

		const completedEvents = extractUnifiedStreamEvents({
			protocol: "openai.responses",
			eventName: "response.completed",
			frame: {
				response: {
					status: "completed",
					output: [{ type: "function_call", call_id: "call_1", name: "tool", arguments: "{}" }],
					usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
				},
			},
		});
		expect(
			completedEvents.some(
				(event) =>
					event.type === "snapshot" && event.isFinal === true,
			),
		).toBe(true);
		expect(completedEvents.some((event) => event.type === "usage")).toBe(true);
		expect(
			completedEvents.some(
				(event) =>
					event.type === "stop" && event.finishReason === "tool_calls",
			),
		).toBe(true);
	});

	it("extracts anthropic message deltas, tool events, usage, and stop", () => {
		const toolStart = extractUnifiedStreamEvents({
			protocol: "anthropic.messages",
			eventName: "content_block_start",
			frame: {
				type: "content_block_start",
				index: 0,
				content_block: { type: "tool_use", id: "tool_1", name: "calc", input: { a: 1 } },
			},
		});
		expect(
			toolStart.some(
				(event) =>
					event.type === "delta_tool" &&
					event.toolCallId === "tool_1" &&
					event.toolName === "calc",
			),
		).toBe(true);

		const usageStop = extractUnifiedStreamEvents({
			protocol: "anthropic.messages",
			eventName: "message_delta",
			frame: {
				type: "message_delta",
				delta: { stop_reason: "end_turn" },
				usage: { input_tokens: 11, output_tokens: 4 },
			},
		});
		expect(usageStop.some((event) => event.type === "usage")).toBe(true);
		expect(
			usageStop.some(
				(event) =>
					event.type === "stop" && event.finishReason === "end_turn",
			),
		).toBe(true);
	});

	it("falls back to wire-shape auto-detection when protocol hint mismatches", () => {
		const events = extractUnifiedStreamEvents({
			protocol: "openai.responses",
			frame: {
				object: "chat.completion.chunk",
				choices: [
					{
						index: 0,
						delta: { content: "hello" },
						finish_reason: null,
					},
				],
			},
		});

		expect(
			events.some(
				(event) =>
					event.type === "delta_text" &&
					event.channel === "output_text" &&
					event.text === "hello",
			),
		).toBe(true);
	});

	it("maps incomplete responses status to a canonical length stop reason", () => {
		const events = extractUnifiedStreamEvents({
			protocol: "openai.responses",
			eventName: "response.completed",
			frame: {
				response: {
					object: "response",
					status: "incomplete",
					incomplete_details: { reason: "max_output_tokens" },
				},
			},
		});

		expect(
			events.some(
				(event) =>
					event.type === "stop" &&
					event.finishReason === "length",
			),
		).toBe(true);
	});
});
