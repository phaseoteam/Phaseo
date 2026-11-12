import { describe, expect, it } from "vitest";
import { UpstreamStreamError } from "@core/stream-errors";
import { consumeTextProtocolStreamToIR } from "./server-tools.stream";

function sse(frames: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const frame of frames) controller.enqueue(encoder.encode(frame));
			controller.close();
		},
	});
}

async function consumeFailure(protocol: any, frames: string[]): Promise<UpstreamStreamError> {
	try {
		await consumeTextProtocolStreamToIR({
			protocol,
			stream: sse(frames),
			requestId: "req_midstream",
			model: "test-model",
			provider: "test-provider",
		});
	} catch (error) {
		expect(error).toBeInstanceOf(UpstreamStreamError);
		return error as UpstreamStreamError;
	}
	throw new Error("expected the materialiser to reject a failed stream");
}

describe("consumeTextProtocolStreamToIR with a mid-stream upstream error", () => {
	it("rejects a Chat stream that ends in a bare error frame and keeps the partial output", async () => {
		const error = await consumeFailure("openai.chat.completions", [
			`data: ${JSON.stringify({ object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "partial" } }] })}\n\n`,
			`data: ${JSON.stringify({ error: { message: "upstream reset", type: "server_error" } })}\n\n`,
		]);
		expect(error.upstreamMessage).toBe("upstream reset");
		expect(error.partial.ir.choices[0]?.message.content).toEqual([{ type: "text", text: "partial" }]);
	});

	it("rejects a Chat stream carrying the gateway's object:error frame", async () => {
		const error = await consumeFailure("openai.chat.completions", [
			`data: ${JSON.stringify({ object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "partial" } }] })}\n\n`,
			`data: ${JSON.stringify({ object: "error", message: "upstream reset" })}\n\n`,
		]);
		expect(error.upstreamMessage).toBe("upstream reset");
	});

	it("rejects a Responses stream that ends in response.failed", async () => {
		const error = await consumeFailure("openai.responses", [
			`event: response.created\ndata: ${JSON.stringify({ response: { id: "resp_1", model: "test-model" } })}\n\n`,
			`event: response.output_text.delta\ndata: ${JSON.stringify({ delta: "partial", output_index: 0, item_id: "msg_1" })}\n\n`,
			`event: response.failed\ndata: ${JSON.stringify({
				response: { id: "resp_1", status: "failed", error: { code: "server_error", message: "upstream reset" }, usage: { input_tokens: 7, output_tokens: 3 } },
			})}\n\n`,
		]);
		expect(error.upstreamMessage).toBe("upstream reset");
	});

	it("rejects a Messages stream that ends in an error event and keeps the usage seen so far", async () => {
		const error = await consumeFailure("anthropic.messages", [
			`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg_1", model: "test-model", usage: { input_tokens: 11, output_tokens: 0 } } })}\n\n`,
			`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`,
			`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "partial" } })}\n\n`,
			`event: error\ndata: ${JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } })}\n\n`,
		]);
		expect(error.upstreamMessage).toBe("Overloaded");
		expect(error.partial.ir.choices[0]?.message.content).toEqual([{ type: "text", text: "partial" }]);
	});

	it("still materialises a stream with no error", async () => {
		const consumed = await consumeTextProtocolStreamToIR({
			protocol: "openai.chat.completions",
			stream: sse([
				`data: ${JSON.stringify({ object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "done" }, finish_reason: "stop" }] })}\n\n`,
				"data: [DONE]\n\n",
			]),
			requestId: "req_ok",
			model: "test-model",
			provider: "test-provider",
		});
		expect(consumed.ir.choices[0]?.finishReason).toBe("stop");
	});
});
