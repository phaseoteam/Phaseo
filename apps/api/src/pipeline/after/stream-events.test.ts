import { describe, expect, it } from "vitest";
import { createToolCallKeyResolver, extractUnifiedStreamEvents } from "./stream-events";

describe("createToolCallKeyResolver", () => {
	it("counts a chat tool call once when only the first chunk carries the id", () => {
		const resolve = createToolCallKeyResolver();
		const keys = new Set([
			resolve({ type: "delta_tool", toolCallId: "call_1", toolName: "lookup", toolIndex: 0, choiceIndex: 0 }),
			resolve({ type: "delta_tool", argumentsDelta: "{\"a\":", toolIndex: 0, choiceIndex: 0 }),
			resolve({ type: "delta_tool", argumentsDelta: "1}", toolIndex: 0, choiceIndex: 0 }),
			resolve({ type: "delta_tool", toolCallId: "call_2", toolName: "other", toolIndex: 1, choiceIndex: 0 }),
		]);
		expect(keys.size).toBe(2);
	});

	it("aliases Responses item ids and call ids to one tool call", () => {
		const resolve = createToolCallKeyResolver();
		const keys = new Set([
			resolve({ type: "delta_tool", toolCallKey: "fc_1", toolCallId: "call_1", toolName: "lookup" }),
			resolve({ type: "delta_tool", toolCallKey: "fc_1", argumentsDelta: "{}" }),
			resolve({ type: "delta_tool", toolCallKey: "fc_1", argumentsDelta: "" }),
		]);
		expect(keys.size).toBe(1);
	});

	it("aliases Anthropic block start ids with index-only argument deltas", () => {
		const resolve = createToolCallKeyResolver();
		const keys = new Set([
			resolve({ type: "delta_tool", toolCallId: "toolu_1", toolName: "lookup", toolIndex: 1, choiceIndex: 0 }),
			resolve({ type: "delta_tool", argumentsDelta: "{}", toolIndex: 1, choiceIndex: 0 }),
		]);
		expect(keys.size).toBe(1);
	});
});

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

	it("reads reasoning once when a chunk carries both reasoning_content and reasoning", () => {
		const reasoningTexts = (delta: Record<string, unknown>) => extractUnifiedStreamEvents({
			protocol: "openai.chat.completions",
			frame: { object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: null }] },
		}).flatMap((event) => (event.type === "delta_text" && event.channel === "reasoning_text" ? [event.text] : []));
		expect(reasoningTexts({ reasoning_content: "think", reasoning: "think" })).toEqual(["think"]);
		expect(reasoningTexts({ reasoning: "think" })).toEqual(["think"]);
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

	it("does not treat generic responses tool_call items as function calls", () => {
		const events = extractUnifiedStreamEvents({
			protocol: "openai.responses",
			eventName: "response.output_item.added",
			frame: {
				output_index: 1,
				item: {
					id: "tc_unknown",
					type: "tool_call",
					status: "completed",
				},
			},
		});

		expect(events.some((event) => event.type === "delta_tool")).toBe(false);
	});

	it("treats named responses tool_call items as function calls", () => {
		const events = extractUnifiedStreamEvents({
			protocol: "openai.responses",
			eventName: "response.output_item.added",
			frame: {
				output_index: 1,
				item: {
					id: "tc_datetime",
					call_id: "call_datetime",
					type: "tool_call",
					function: {
						name: "gateway_datetime",
						arguments: "{\"timezones\":[\"UTC\"]}",
					},
				},
			},
		});

		expect(events).toContainEqual(
			expect.objectContaining({
				type: "delta_tool",
				toolCallKey: "tc_datetime",
				toolCallId: "call_datetime",
				toolName: "gateway_datetime",
				arguments: "{\"timezones\":[\"UTC\"]}",
			}),
		);

		const completedEvents = extractUnifiedStreamEvents({
			protocol: "openai.responses",
			eventName: "response.completed",
			frame: {
				response: {
					status: "completed",
					output: [
						{
							type: "tool_call",
							id: "tc_datetime",
							call_id: "call_datetime",
							function: {
								name: "gateway_datetime",
								arguments: "{\"timezones\":[\"UTC\"]}",
							},
						},
					],
				},
			},
		});
		expect(
			completedEvents.some(
				(event) =>
					event.type === "stop" && event.finishReason === "tool_calls",
			),
		).toBe(true);
	});

	it("does not treat generic responses tool_call argument completions as function calls", () => {
		const events = extractUnifiedStreamEvents({
			protocol: "openai.responses",
			eventName: "response.function_call_arguments.done",
			frame: {
				item_id: "fc_shadow",
				output_index: 2,
				name: "tool_call",
				arguments: "{\"timezones\":[\"UTC\"]}",
			},
		});

		expect(events.some((event) => event.type === "delta_tool")).toBe(false);
	});

	it("preserves separate Responses item and provider call IDs for function-call events", () => {
		const outputItemEvents = extractUnifiedStreamEvents({
			protocol: "openai.responses",
			eventName: "response.output_item.added",
			frame: {
				output_index: 0,
				item: {
					type: "function_call",
					id: "fc_123",
					call_id: "call_123",
					name: "gateway_datetime",
					arguments: "",
				},
			},
		});
		expect(outputItemEvents).toContainEqual(
			expect.objectContaining({
				type: "delta_tool",
				toolCallKey: "fc_123",
				toolCallId: "call_123",
				toolName: "gateway_datetime",
			}),
		);

		const argumentEvents = extractUnifiedStreamEvents({
			protocol: "openai.responses",
			eventName: "response.function_call_arguments.done",
			frame: {
				item_id: "fc_123",
				call_id: "call_123",
				output_index: 0,
				name: "gateway_datetime",
				arguments: "{\"timezones\":[\"UTC\"]}",
			},
		});
		expect(argumentEvents).toContainEqual(
			expect.objectContaining({
				type: "delta_tool",
				toolCallKey: "fc_123",
				toolCallId: "call_123",
				toolName: "gateway_datetime",
				arguments: "{\"timezones\":[\"UTC\"]}",
			}),
		);
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

	it("treats response.incomplete as terminal, with usage and the content filter reason", () => {
		const events = extractUnifiedStreamEvents({
			protocol: "openai.responses",
			eventName: "response.incomplete",
			frame: {
				type: "response.incomplete",
				response: {
					object: "response",
					status: "incomplete",
					incomplete_details: { reason: "content_filter" },
					usage: { input_tokens: 10, output_tokens: 4 },
				},
			},
		});
		expect(events.map((event) => event.type)).toEqual(["snapshot", "usage", "stop"]);
		expect(events.find((event) => event.type === "stop")).toMatchObject({ finishReason: "content_filter" });
	});

	it("reports a completed response as stop, and the carried Anthropic stop when present", () => {
		const completed = extractUnifiedStreamEvents({
			protocol: "openai.responses",
			eventName: "response.completed",
			frame: { response: { object: "response", status: "completed", output: [] } },
		});
		expect(completed.find((event) => event.type === "stop")).toMatchObject({ finishReason: "stop" });

		const paused = extractUnifiedStreamEvents({
			protocol: "openai.responses",
			eventName: "response.completed",
			frame: { response: { object: "response", status: "completed", output: [], _phaseo_stop: { reason: "pause_turn" } } },
		});
		expect(paused.find((event) => event.type === "stop")).toMatchObject({ finishReason: "pause_turn" });
	});

	it("does not give message_stop a stop reason of its own", () => {
		const delta = extractUnifiedStreamEvents({
			protocol: "anthropic.messages",
			eventName: "message_delta",
			frame: { type: "message_delta", delta: { stop_reason: "stop_sequence", stop_sequence: "###" } },
		});
		expect(delta.find((event) => event.type === "stop")).toMatchObject({ finishReason: "stop_sequence", stopSequence: "###" });

		const stop = extractUnifiedStreamEvents({
			protocol: "anthropic.messages",
			eventName: "message_stop",
			frame: { type: "message_stop" },
		});
		expect(stop).toEqual([{ type: "stop", finishReason: null, payload: { type: "message_stop" } }]);
	});
});

describe("mid-stream upstream errors", () => {
	it("reads a bare OpenAI-compatible error frame on a Chat stream as an error", () => {
		const events = extractUnifiedStreamEvents({
			protocol: "openai.chat.completions",
			frame: { error: { message: "upstream reset", type: "server_error" } },
		});
		expect(events).toEqual([expect.objectContaining({ type: "error", message: "upstream reset" })]);
	});

	it("does not read a chunk that carries an error field next to choices as a failure", () => {
		const events = extractUnifiedStreamEvents({
			protocol: "openai.chat.completions",
			frame: { object: "chat.completion.chunk", error: null, choices: [{ index: 0, delta: { content: "hi" } }] },
		});
		expect(events.some((event) => event.type === "error")).toBe(false);
	});

	it("takes the message of response.failed from response.error", () => {
		const events = extractUnifiedStreamEvents({
			protocol: "openai.responses",
			eventName: "response.failed",
			frame: { response: { status: "failed", error: { code: "server_error", message: "upstream reset" } } },
		});
		expect(events).toEqual(expect.arrayContaining([
			expect.objectContaining({ type: "error", message: "upstream reset" }),
			expect.objectContaining({ type: "stop", finishReason: "error" }),
		]));
	});
});
