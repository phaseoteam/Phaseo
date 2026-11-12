import { describe, expect, it } from "vitest";
import {
	createMessagesEventAccumulator,
	resolveMessagesStreamAuditResponse,
} from "./messages-stream-log-snapshot";
import { validateStructuredOutputResponse, validateToolCallResponses } from "../audit/response-validation";

const streamEvents = [
	{ type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "anthropic/claude", content: [], usage: { input_tokens: 10, output_tokens: 1 } } },
	{ type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
	{ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Weighing it." } },
	{ type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig" } },
	{ type: "content_block_stop", index: 0 },
	{ type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
	{ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: '{"answer":' } },
	{ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: '"yes"}' } },
	{ type: "content_block_stop", index: 1 },
	{ type: "content_block_start", index: 2, content_block: { type: "tool_use", id: "toolu_1", name: "get_weather", input: {} } },
	{ type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '{"city":' } },
	{ type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '"London"}' } },
	{ type: "content_block_stop", index: 2 },
	{ type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 40 } },
	{ type: "message_stop" },
];

describe("createMessagesEventAccumulator", () => {
	it("rebuilds a streamed Messages reply with its text, thinking and tool calls", () => {
		const accumulator = createMessagesEventAccumulator();
		for (const event of streamEvents) accumulator.add(event);
		expect(accumulator.toMessage()).toEqual({
			id: "msg_1",
			type: "message",
			role: "assistant",
			model: "anthropic/claude",
			content: [
				{ type: "thinking", thinking: "Weighing it.", signature: "sig" },
				{ type: "text", text: '{"answer":"yes"}' },
				{ type: "tool_use", id: "toolu_1", name: "get_weather", input: { city: "London" } },
			],
			stop_reason: "tool_use",
			stop_sequence: null,
			usage: { input_tokens: 10, output_tokens: 40 },
		});
	});

	it("keeps unparseable tool input as text so the check reports it", () => {
		const accumulator = createMessagesEventAccumulator();
		accumulator.add({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "t", name: "get_weather", input: {} } });
		accumulator.add({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"city":' } });
		const request = { tools: [{ name: "get_weather", input_schema: { type: "object", properties: { city: { type: "string" } } } }] };
		expect(validateToolCallResponses(request, accumulator.toMessage())).toMatchObject({ totalCalls: 1, invalidJson: 1 });
	});

	it("lets the audit check a streamed reply whose last event has no content", () => {
		const accumulator = createMessagesEventAccumulator();
		for (const event of streamEvents) accumulator.add(event);
		// The stream's own final snapshot is message_stop, which carries no content.
		const audited = resolveMessagesStreamAuditResponse({ type: "message_stop" }, accumulator);
		const request = {
			tools: [{ name: "get_weather", input_schema: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } }],
			output_config: { format: { type: "json_schema", schema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"] } } },
		};
		expect(validateToolCallResponses(request, audited)).toMatchObject({ totalCalls: 1, invalidCalls: 0 });
		expect(validateStructuredOutputResponse(request, audited)).toMatchObject({ attempted: true, succeeded: true });
	});

	it("prefers a whole message snapshot when the stream sends one", () => {
		const accumulator = createMessagesEventAccumulator();
		accumulator.add(streamEvents[0]);
		const snapshot = { type: "message", content: [{ type: "text", text: "hi" }] };
		expect(resolveMessagesStreamAuditResponse(snapshot, accumulator)).toBe(snapshot);
	});
});
