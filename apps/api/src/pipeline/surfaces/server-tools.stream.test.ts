import { describe, expect, it } from "vitest";
import { consumeTextProtocolStreamToIR } from "./server-tools.stream";

function buildSseStream(frames: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const frame of frames) {
				controller.enqueue(encoder.encode(frame));
			}
			controller.close();
		},
	});
}

describe("consumeTextProtocolStreamToIR", () => {
	it("recovers final assistant text from terminal chat completion snapshots", async () => {
		const finalPayload = {
			id: "req_server_tool_stream",
			object: "chat.completion",
			created: 1778073808,
			model: "gpt-5.4-nano-2026-03-17",
			provider: "openai",
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: "Current time is 12:00 UTC.",
					},
					finish_reason: "stop",
				},
			],
			usage: {
				input_tokens: 10,
				output_tokens: 6,
				total_tokens: 16,
				server_tool_use: {
					datetime_requests: 1,
				},
			},
		};

		const stream = buildSseStream([
			`data: ${JSON.stringify(finalPayload)}\n\n`,
			"data: [DONE]",
		]);

		const consumed = await consumeTextProtocolStreamToIR({
			protocol: "openai.chat.completions",
			stream,
			requestId: "req_server_tool_stream",
			model: "openai/gpt-5.4-nano",
			provider: "openai",
		});

		expect(consumed.sawDone).toBe(true);
		expect(consumed.ir.choices[0]?.message?.content).toEqual([
			{ type: "text", text: "Current time is 12:00 UTC." },
		]);
		expect(consumed.ir.usage?._ext?.serverToolUse?.datetime_requests).toBe(1);
	});

	it("backfills real tool call ids when earlier chat deltas omit them", async () => {
		const stream = buildSseStream([
			`data: ${JSON.stringify({
				id: "chatcmpl_tool_delta",
				object: "chat.completion.chunk",
				created: 1778073808,
				model: "gpt-5.4-nano-2026-03-17",
				choices: [{
					index: 0,
					delta: {
						role: "assistant",
						tool_calls: [{
							index: 0,
							type: "function",
							function: {
								name: "get_weather",
								arguments: "{\"city\":\"London\"}",
							},
						}],
					},
					finish_reason: null,
				}],
			})}\n\n`,
			`data: ${JSON.stringify({
				id: "chatcmpl_tool_delta",
				object: "chat.completion.chunk",
				created: 1778073808,
				model: "gpt-5.4-nano-2026-03-17",
				choices: [{
					index: 0,
					delta: {
						tool_calls: [{
							index: 0,
							id: "call_weather",
						}],
					},
					finish_reason: "tool_calls",
				}],
				usage: {
					prompt_tokens: 10,
					completion_tokens: 6,
					total_tokens: 16,
				},
			})}`,
		]);

		const consumed = await consumeTextProtocolStreamToIR({
			protocol: "openai.chat.completions",
			stream,
			requestId: "req_server_tool_stream",
			model: "openai/gpt-5.4-nano",
			provider: "openai",
		});

		expect(consumed.ir.choices[0]?.message?.toolCalls).toEqual([
			{
				id: "call_weather",
				name: "get_weather",
				arguments: "{\"city\":\"London\"}",
			},
		]);
		expect(consumed.ir.choices[0]?.finishReason).toBe("tool_calls");
	});

	it("preserves image output when materializing a responses snapshot", async () => {
		const finalPayload = {
			id: "resp_gemini_image",
			object: "response",
			created_at: 1778073808,
			model: "google/gemini-2.5-flash-image",
			status: "completed",
			output: [
				{
					type: "message",
					id: "msg_gemini_image",
					status: "completed",
					role: "assistant",
					content: [
						{ type: "output_text", text: "Here's your image.", annotations: [] },
						{
							type: "output_image",
							b64_json: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
							mime_type: "image/png",
						},
					],
				},
			],
			usage: {
				input_tokens: 12,
				output_tokens: 18,
				total_tokens: 30,
			},
		};

		const stream = buildSseStream([
			`event: response.completed\ndata: ${JSON.stringify({ response: finalPayload })}\n\n`,
			"data: [DONE]",
		]);

		const consumed = await consumeTextProtocolStreamToIR({
			protocol: "openai.responses",
			stream,
			requestId: "req_gemini_image",
			model: "google/gemini-2.5-flash-image",
			provider: "google-ai-studio",
		});

		expect(consumed.ir.choices[0]?.message?.content).toEqual([
			{ type: "text", text: "Here's your image." },
			{
				type: "image",
				source: "data",
				data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
				mimeType: "image/png",
			},
		]);
		expect(consumed.rawResponse?.output?.[0]?.content?.[1]?.type).toBe("output_image");
	});

	it("preserves media from chat completion deltas", async () => {
		const stream = buildSseStream([
			`data: ${JSON.stringify({
				id: "chatcmpl_gemini_image",
				object: "chat.completion.chunk",
				created: 1778073808,
				model: "google/gemini-2.5-flash-image",
				choices: [{
					index: 0,
					delta: {
						role: "assistant",
						content: "Here's your image.",
						images: [{
							type: "image_url",
							image_url: {
								url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
							},
							mime_type: "image/png",
						}],
					},
					finish_reason: "stop",
				}],
				usage: {
					prompt_tokens: 9,
					completion_tokens: 7,
					total_tokens: 16,
				},
			})}\n\n`,
			"data: [DONE]",
		]);

		const consumed = await consumeTextProtocolStreamToIR({
			protocol: "openai.chat.completions",
			stream,
			requestId: "req_chat_gemini_image",
			model: "google/gemini-2.5-flash-image",
			provider: "google-ai-studio",
		});

		expect(consumed.ir.choices[0]?.message?.content).toEqual([
			{ type: "text", text: "Here's your image." },
			{
				type: "image",
				source: "data",
				data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
				mimeType: "image/png",
			},
		]);
	});
});
