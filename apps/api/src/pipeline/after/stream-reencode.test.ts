import { describe, expect, it } from "vitest";
import { createStreamReencoder } from "./stream-reencode";
import { extractUnifiedStreamEvents } from "./stream-events";

type Source = { event?: string; data: any };

function reencode(target: "anthropic.messages" | "openai.responses" | "openai.chat.completions", frames: Source[]) {
	const reencoder = createStreamReencoder(target, { requestId: "req_1", model: "m" });
	const out = [];
	for (const frame of frames) {
		const events = extractUnifiedStreamEvents({ protocol: target, eventName: frame.event ?? null, frame: frame.data });
		out.push(...reencoder.encode(events, { eventName: frame.event ?? null, frame: frame.data }));
	}
	out.push(...reencoder.flush());
	return out;
}

const responsesSource: Source[] = [
	{ event: "response.created", data: { type: "response.created", response: { id: "r", object: "response", status: "in_progress" } } },
	{ event: "response.output_item.added", data: { type: "response.output_item.added", output_index: 0, item: { type: "message", id: "m1", content: [{ type: "output_text", text: "Hi" }] } } },
	{ event: "response.output_text.delta", data: { type: "response.output_text.delta", output_index: 0, item_id: "m1", delta: "Hi" } },
	{ event: "response.output_item.done", data: { type: "response.output_item.done", output_index: 1, item: { type: "reasoning", id: "rs1", content: [{ type: "output_text", text: "Because." }] } } },
	{ event: "response.output_item.added", data: { type: "response.output_item.added", output_index: 2, item: { type: "function_call", id: "fc1", call_id: "call_1", name: "f", arguments: "{\"a\":1}" } } },
	{ event: "response.function_call_arguments.delta", data: { type: "response.function_call_arguments.delta", item_id: "fc1", call_id: "call_1", name: "f", delta: "{\"a\":1}" } },
	{ event: "response.function_call_arguments.done", data: { type: "response.function_call_arguments.done", item_id: "fc1", call_id: "call_1", name: "f", arguments: "{\"a\":1}" } },
	{ event: "response.completed", data: { type: "response.completed", response: { id: "r", object: "response", status: "completed", output: [{ type: "function_call", id: "fc1", call_id: "call_1", name: "f", arguments: "{\"a\":1}" }], usage: { input_tokens: 4, output_tokens: 2 } } } },
];

describe("createStreamReencoder", () => {
	it("gives Messages clients blocks, one message_delta with usage, and message_stop last", () => {
		const out = reencode("anthropic.messages", responsesSource);
		expect(out.map((frame) => frame.frame.type)).toEqual([
			"message_start",
			"content_block_start", "content_block_delta", "content_block_stop",
			"content_block_start", "content_block_delta", "content_block_stop",
			"content_block_start", "content_block_delta", "content_block_stop",
			"message_delta",
			"message_stop",
		]);
		expect(out[5].frame.delta).toEqual({ type: "thinking_delta", thinking: "Because." });
		const toolDeltas = out.filter((frame) => frame.frame.delta?.type === "input_json_delta");
		expect(toolDeltas.map((frame) => frame.frame.delta.partial_json)).toEqual(["{\"a\":1}"]);
		expect(out[10].frame).toMatchObject({ delta: { stop_reason: "tool_use" }, usage: { input_tokens: 4, output_tokens: 2 } });
		expect(out.some((frame) => String(frame.frame.type).startsWith("response."))).toBe(false);
	});

	it("gives Responses clients output_item.added before deltas and one terminal with trailing usage", () => {
		const out = reencode("openai.responses", [
			{ data: { object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "Hi" }, finish_reason: null }] } },
			{ data: { object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "length" }] } },
			{ data: { object: "chat.completion.chunk", choices: [], usage: { prompt_tokens: 4, completion_tokens: 2 } } },
		]);
		expect(out.map((frame) => frame.eventName)).toEqual([
			"response.created",
			"response.output_item.added",
			"response.output_text.delta",
			"response.incomplete",
		]);
		expect(out[3].frame.response).toMatchObject({
			status: "incomplete",
			incomplete_details: { reason: "max_output_tokens" },
			usage: { prompt_tokens: 4, completion_tokens: 2 },
		});
	});

	it("drops the foreign snapshot and keeps one finish_reason for Chat clients", () => {
		const out = reencode("openai.chat.completions", responsesSource);
		expect(out.every((frame) => frame.frame.object === "chat.completion.chunk")).toBe(true);
		const finishes = out.flatMap((frame) => (frame.frame.choices ?? []).map((choice: any) => choice.finish_reason)).filter(Boolean);
		expect(finishes).toEqual(["tool_calls"]);
	});
});
