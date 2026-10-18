import { describe, expect, it } from "vitest";
import { openReasoningState, sealReasoningState } from "@core/reasoning-state";
import { decodeChatReasoningDetails } from "@protocols/shared/reasoning";
import { encodeProtocol } from "@protocols/index";
import { consumeTextProtocolStreamToIR } from "./server-tools.stream";

// Buffered clients are served from the client-protocol stream rebuilt into IR
// (materializeStreamResultToCompleted), then encodeProtocol. These tests run
// that same path and check that reasoning state survives it.

function sse(frames: Array<{ event?: string; data: unknown } | string>): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const frame of frames) {
				if (typeof frame === "string") {
					controller.enqueue(encoder.encode(`data: ${frame}\n\n`));
					continue;
				}
				const prefix = frame.event ? `event: ${frame.event}\n` : "";
				controller.enqueue(encoder.encode(`${prefix}data: ${JSON.stringify(frame.data)}\n\n`));
			}
			controller.close();
		},
	});
}

const CLAUDE = { format: "anthropic-claude-v1" as const, model: "claude-fable-5-1", provider: "anthropic" };
const SIGNED = sealReasoningState({ ...CLAUDE, kind: "signature", value: "SIG-0001" });
const REDACTED = sealReasoningState({ ...CLAUDE, kind: "redacted", value: "REDACTED-0001" });

function chatChunk(delta: Record<string, unknown>, extra: Record<string, unknown> = {}) {
	return { data: { object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: null }], ...extra } };
}

const toolCall = { index: 0, id: "call_1", type: "function", function: { name: "weather", arguments: "{\"city\":\"Lyon\"}" } };

describe("buffered responses keep reasoning state from the stream", () => {
	it("Chat: keeps Claude's signed and redacted thinking once, even when a final snapshot repeats them", async () => {
		const details = [
			{ id: "rs_1", index: 0, type: "reasoning.text", text: "Check the tool first.", signature: SIGNED, format: CLAUDE.format },
			{ id: "rs_2", index: 1, type: "reasoning.encrypted", data: REDACTED, format: CLAUDE.format },
		];
		const stream = sse([
			chatChunk({ role: "assistant", reasoning_content: "Check the tool" }),
			chatChunk({ reasoning_content: " first." }),
			chatChunk({ reasoning_details: [details[0]] }),
			chatChunk({ reasoning_details: [details[1]] }),
			chatChunk({ tool_calls: [toolCall] }),
			{ data: { object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: null, reasoning_content: "Check the tool first.", reasoning_details: details, tool_calls: [toolCall] }, finish_reason: "tool_calls" }] } },
			"[DONE]",
		]);
		const { ir } = await consumeTextProtocolStreamToIR({ protocol: "openai.chat.completions", stream, requestId: "req_chat", model: "anthropic/claude-fable-5.1", provider: "anthropic" });

		const reasoning = ir.choices[0].message.content.filter((part) => part.type === "reasoning_text");
		expect(reasoning).toEqual([
			expect.objectContaining({ text: "Check the tool first.", thoughtSignature: "SIG-0001", reasoningFormat: CLAUDE.format }),
			expect.objectContaining({ text: "", redactedData: "REDACTED-0001", reasoningFormat: CLAUDE.format }),
		]);

		const chat = encodeProtocol("openai.chat.completions", ir, "req_chat");
		const message = chat.choices[0].message;
		expect(message.reasoning_content).toBe("Check the tool first.");
		expect(message.reasoning_details).toEqual([
			expect.objectContaining({ type: "reasoning.text", text: "Check the tool first.", signature: SIGNED, format: CLAUDE.format }),
			expect.objectContaining({ type: "reasoning.encrypted", data: REDACTED, format: CLAUDE.format }),
		]);
		// What the client sends back decodes to the same state for the next step.
		const replay = decodeChatReasoningDetails(message.reasoning_details, new Set(["call_1"]));
		expect(replay.parts.map((part) => [part.thoughtSignature, part.redactedData])).toEqual([["SIG-0001", undefined], [undefined, "REDACTED-0001"]]);
	});

	it("Chat: attaches a Gemini function-call signature to its tool call", async () => {
		const callSignature = sealReasoningState({ format: "google-gemini-v1", kind: "signature", value: "FC-SIG", model: "gemini-3.8-flash", provider: "google-vertex", callId: "call_1" });
		const stream = sse([
			chatChunk({ role: "assistant", reasoning_details: [{ type: "reasoning.encrypted", id: "call_1", data: callSignature, format: "google-gemini-v1", index: 0 }], tool_calls: [toolCall] }),
			chatChunk({}, { choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] }),
			"[DONE]",
		]);
		const { ir } = await consumeTextProtocolStreamToIR({ protocol: "openai.chat.completions", stream, requestId: "req_gemini", model: "google/gemini-3.8-flash", provider: "google-vertex" });

		expect(ir.choices[0].message.toolCalls?.[0]).toMatchObject({ id: "call_1", thoughtSignature: "FC-SIG", thoughtSignatureModel: "gemini-3.8-flash" });
		const chat = encodeProtocol("openai.chat.completions", ir, "req_gemini");
		expect(chat.choices[0].message.reasoning_details).toEqual([
			expect.objectContaining({ id: "call_1", type: "reasoning.encrypted", format: "google-gemini-v1" }),
		]);
	});

	it("Messages: keeps the signature, redacted thinking and interleaved thinking order", async () => {
		const block = (index: number, content_block: Record<string, unknown>) => ({ event: "content_block_start", data: { type: "content_block_start", index, content_block } });
		const delta = (index: number, value: Record<string, unknown>) => ({ event: "content_block_delta", data: { type: "content_block_delta", index, delta: value } });
		const stop = (index: number) => ({ event: "content_block_stop", data: { type: "content_block_stop", index } });
		const stream = sse([
			{ event: "message_start", data: { type: "message_start", message: { id: "msg_1", model: "claude-fable-5-1", usage: { input_tokens: 5, output_tokens: 0 } } } },
			block(0, { type: "thinking", thinking: "" }),
			delta(0, { type: "thinking_delta", thinking: "Check the" }),
			delta(0, { type: "thinking_delta", thinking: " tool first." }),
			delta(0, { type: "signature_delta", signature: "SIG-0001" }),
			stop(0),
			block(1, { type: "redacted_thinking", data: "REDACTED-0001" }),
			stop(1),
			block(2, { type: "tool_use", id: "toolu_1", name: "weather", input: {} }),
			delta(2, { type: "input_json_delta", partial_json: "{\"city\":\"Lyon\"}" }),
			stop(2),
			block(3, { type: "thinking", thinking: "" }),
			delta(3, { type: "thinking_delta", thinking: "Now search." }),
			delta(3, { type: "signature_delta", signature: "SIG-0002" }),
			stop(3),
			block(4, { type: "tool_use", id: "toolu_2", name: "search", input: {} }),
			delta(4, { type: "input_json_delta", partial_json: "{\"q\":\"lyon\"}" }),
			stop(4),
			{ event: "message_delta", data: { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 9 } } },
			{ event: "message_stop", data: { type: "message_stop" } },
		]);
		const { ir } = await consumeTextProtocolStreamToIR({ protocol: "anthropic.messages", stream, requestId: "req_messages", model: "anthropic/claude-fable-5.1", provider: "anthropic" });

		const messages = encodeProtocol("anthropic.messages", ir, "req_messages");
		expect(messages.content).toEqual([
			{ type: "thinking", thinking: "Check the tool first.", signature: "SIG-0001" },
			{ type: "redacted_thinking", data: "REDACTED-0001" },
			{ type: "tool_use", id: "toolu_1", name: "weather", input: { city: "Lyon" } },
			{ type: "thinking", thinking: "Now search.", signature: "SIG-0002" },
			{ type: "tool_use", id: "toolu_2", name: "search", input: { q: "lyon" } },
		]);

		// The same IR on Chat returns the state sealed.
		const chat = encodeProtocol("openai.chat.completions", ir, "req_messages");
		expect(chat.choices[0].message.reasoning_details.map((detail: any) => {
			const state = openReasoningState(detail.signature ?? detail.data);
			return [state?.format, state?.kind, state?.value];
		})).toEqual([
			[CLAUDE.format, "signature", "SIG-0001"],
			[CLAUDE.format, "redacted", "REDACTED-0001"],
			[CLAUDE.format, "signature", "SIG-0002"],
		]);
	});

	it("Messages: a sealed signature from another provider keeps its format", async () => {
		const openaiState = sealReasoningState({ format: "openai-responses-v1", kind: "encrypted", value: "ENC-0001", model: "gpt-5.4", provider: "openai" });
		const stream = sse([
			{ event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } } },
			{ event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Plan." } } },
			{ event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: openaiState } } },
			{ event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
			{ event: "content_block_start", data: { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } } },
			{ event: "content_block_delta", data: { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Done." } } },
			{ event: "content_block_stop", data: { type: "content_block_stop", index: 1 } },
			{ event: "message_stop", data: { type: "message_stop" } },
		]);
		const { ir } = await consumeTextProtocolStreamToIR({ protocol: "anthropic.messages", stream, requestId: "req_openai", model: "openai/gpt-5.4", provider: "openai" });

		expect(ir.choices[0].message.content[0]).toMatchObject({ type: "reasoning_text", text: "Plan.", encryptedContent: "ENC-0001", reasoningFormat: "openai-responses-v1" });
		const messages = encodeProtocol("anthropic.messages", ir, "req_openai");
		expect(messages.content[0]).toEqual({ type: "thinking", thinking: "Plan.", signature: openaiState });
	});

	it("Responses: keeps encrypted reasoning from output_item.done without duplicating the completed snapshot", async () => {
		const item = { type: "reasoning", id: "rs_1", summary: [], content: [{ type: "output_text", text: "Think." }], encrypted_content: SIGNED };
		const stream = sse([
			{ event: "response.reasoning_text.delta", data: { type: "response.reasoning_text.delta", item_id: "rs_1", output_index: 0, delta: "Think." } },
			{ event: "response.output_item.done", data: { type: "response.output_item.done", output_index: 0, item } },
			{ event: "response.output_text.delta", data: { type: "response.output_text.delta", item_id: "msg_1", output_index: 1, delta: "Hi." } },
			{ event: "response.completed", data: { type: "response.completed", response: { id: "resp_1", object: "response", status: "completed", output: [item, { type: "message", role: "assistant", content: [{ type: "output_text", text: "Hi." }] }] } } },
		]);
		const { ir } = await consumeTextProtocolStreamToIR({ protocol: "openai.responses", stream, requestId: "req_responses", model: "anthropic/claude-fable-5.1", provider: "anthropic" });

		const reasoning = ir.choices[0].message.content.filter((part) => part.type === "reasoning_text");
		expect(reasoning).toEqual([expect.objectContaining({ text: "Think.", thoughtSignature: "SIG-0001", reasoningFormat: CLAUDE.format })]);
	});

	it("Chat: keeps each encrypted reasoning item's own text from the final snapshot", async () => {
		const OPENAI = { format: "openai-responses-v1" as const, model: "gpt-5.4", provider: "openai" };
		const enc1 = sealReasoningState({ ...OPENAI, kind: "encrypted", value: "ENC-0001" });
		const enc2 = sealReasoningState({ ...OPENAI, kind: "encrypted", value: "ENC-0002" });
		// Deltas carry only the sealed entries; the snapshot pairs each with its text.
		const snapshotDetails = [
			{ id: "rs_1", index: 0, type: "reasoning.text", text: "First.", format: OPENAI.format },
			{ id: "rs_1", index: 1, type: "reasoning.encrypted", data: enc1, format: OPENAI.format },
			{ id: "rs_2", index: 2, type: "reasoning.text", text: "Second.", format: OPENAI.format },
			{ id: "rs_2", index: 3, type: "reasoning.encrypted", data: enc2, format: OPENAI.format },
		];
		const stream = sse([
			chatChunk({ role: "assistant", reasoning_content: "First." }),
			chatChunk({ reasoning_details: [snapshotDetails[1]] }),
			chatChunk({ reasoning_content: "Second." }),
			chatChunk({ reasoning_details: [snapshotDetails[3]] }),
			chatChunk({ content: "Answer." }),
			{ data: { object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: "Answer.", reasoning_content: "First.Second.", reasoning_details: snapshotDetails }, finish_reason: "stop" }] } },
			"[DONE]",
		]);
		const { ir } = await consumeTextProtocolStreamToIR({ protocol: "openai.chat.completions", stream, requestId: "req_enc", model: "openai/gpt-5.4", provider: "openai" });

		const reasoning = ir.choices[0].message.content.filter((part) => part.type === "reasoning_text");
		expect(reasoning).toEqual([
			expect.objectContaining({ text: "First.", encryptedContent: "ENC-0001" }),
			expect.objectContaining({ text: "Second.", encryptedContent: "ENC-0002" }),
		]);
	});

	it("Responses: anchors reasoning that follows a function call to the next call", async () => {
		const SIGNED_2 = sealReasoningState({ ...CLAUDE, kind: "signature", value: "SIG-0002" });
		const reasoning1 = { type: "reasoning", id: "rs_1", summary: [], content: [{ type: "reasoning_text", text: "Check the weather." }], encrypted_content: SIGNED };
		const call1 = { type: "function_call", id: "fc_1", call_id: "call_1", name: "weather", arguments: "{\"city\":\"Lyon\"}", status: "completed" };
		const reasoning2 = { type: "reasoning", id: "rs_2", summary: [], content: [{ type: "reasoning_text", text: "Now search." }], encrypted_content: SIGNED_2 };
		const call2 = { type: "function_call", id: "fc_2", call_id: "call_2", name: "search", arguments: "{\"q\":\"lyon\"}", status: "completed" };
		const output = [reasoning1, call1, reasoning2, call2];
		const done = (item: any, index: number) => ({ event: "response.output_item.done", data: { type: "response.output_item.done", output_index: index, item } });
		const stream = sse([
			...output.map(done),
			{ event: "response.completed", data: { type: "response.completed", response: { id: "resp_1", object: "response", status: "completed", output } } },
		]);
		const { ir } = await consumeTextProtocolStreamToIR({ protocol: "openai.responses", stream, requestId: "req_interleaved", model: "anthropic/claude-fable-5.1", provider: "anthropic" });

		const reasoning = ir.choices[0].message.content.filter((part) => part.type === "reasoning_text");
		expect(reasoning).toEqual([
			expect.objectContaining({ thoughtSignature: "SIG-0001" }),
			expect.objectContaining({ thoughtSignature: "SIG-0002", beforeToolCallId: "call_2" }),
		]);
		expect((reasoning[0] as any).beforeToolCallId).toBeUndefined();
	});

	it("leaves plain reasoning text alone when the stream carries no state", async () => {
		const stream = sse([
			chatChunk({ role: "assistant", reasoning_content: "Plain thought." }),
			chatChunk({ reasoning_details: [{ type: "reasoning.text", text: "Plain thought.", format: "unknown", index: 0 }] }),
			chatChunk({ content: "Answer." }),
			"[DONE]",
		]);
		const { ir } = await consumeTextProtocolStreamToIR({ protocol: "openai.chat.completions", stream, requestId: "req_plain", model: "test/model", provider: "test" });

		expect(ir.choices[0].message.content).toEqual([
			{ type: "reasoning_text", text: "Plain thought." },
			{ type: "text", text: "Answer." },
		]);
	});
});
