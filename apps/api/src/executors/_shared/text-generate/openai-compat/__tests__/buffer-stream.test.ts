import { describe, expect, it } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
import { bufferStreamToIR } from "../index";
import { transformStream as transformGoogleStream } from "@executors/google-ai-studio/text-generate";

function buildArgs(): ExecutorExecuteArgs {
	return {
		ir: {
			model: "openai/gpt-5.4-nano",
			stream: false,
			messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
		},
		requestId: "req_buffer_stream_test",
		workspaceId: "team_test",
		providerId: "openai",
		endpoint: "chat.completions",
		protocol: "openai.chat.completions",
		capability: "text.generate",
		providerModelSlug: null,
		capabilityParams: null,
		byokMeta: [],
		pricingCard: { rules: [] } as any,
		meta: {},
	} as ExecutorExecuteArgs;
}

function sseResponse(frames: string[]): Response {
	const body = frames.join("");
	return new Response(body, {
		status: 200,
		headers: { "Content-Type": "text/event-stream" },
	});
}

describe("bufferStreamToIR", () => {
	it("captures trailing native chat text frames without a terminating separator", async () => {
		const response = sseResponse([
			`data: ${JSON.stringify({
				id: "chatcmpl_trailing_text",
				object: "chat.completion.chunk",
				created: 1778073808,
				model: "gpt-5.4-nano",
				choices: [{ index: 0, delta: { role: "assistant", content: "done" }, finish_reason: "stop" }],
				usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
			})}`,
		]);

		const buffered = await bufferStreamToIR(response, buildArgs(), "chat", Date.now());

		expect(buffered.ir.choices[0]?.message?.content).toEqual([
			{ type: "text", text: "done" },
		]);
		expect(buffered.ir.usage?.totalTokens).toBe(6);
	});

	it("captures trailing native chat tool call ids without a terminating separator", async () => {
		const response = sseResponse([
			`data: ${JSON.stringify({
				id: "chatcmpl_trailing_tool",
				object: "chat.completion.chunk",
				created: 1778073808,
				model: "gpt-5.4-nano",
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
				id: "chatcmpl_trailing_tool",
				object: "chat.completion.chunk",
				created: 1778073808,
				model: "gpt-5.4-nano",
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
				usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
			})}`,
		]);

		const buffered = await bufferStreamToIR(response, buildArgs(), "chat", Date.now());

		expect(buffered.ir.choices[0]?.message?.toolCalls).toEqual([
			{
				id: "call_weather",
				name: "get_weather",
				arguments: "{\"city\":\"London\"}",
			},
		]);
		expect(buffered.ir.choices[0]?.finishReason).toBe("tool_calls");
	});

	it("handles Google stream payload arrays with image parts", async () => {
		const googleFrames = [
			`data: ${JSON.stringify([{
				candidates: [{
					index: 0,
					content: {
						parts: [{
							inlineData: {
								mimeType: "image/png",
								data: "aW1hZ2UtYnl0ZXM=",
							},
						}],
					},
					finishReason: "STOP",
				}],
				usageMetadata: {
					promptTokenCount: 11,
					candidatesTokenCount: 5,
					totalTokenCount: 16,
				},
			}])}\n\n`,
		];

		const googleStream = new ReadableStream<Uint8Array>({
			start(controller) {
				const encoder = new TextEncoder();
				for (const frame of googleFrames) {
					controller.enqueue(encoder.encode(frame));
				}
				controller.close();
			},
		});

		const transformed = transformGoogleStream(googleStream, {
			...buildArgs(),
			providerId: "google-ai-studio",
			providerModelSlug: "gemini-2.5-flash-image",
			protocol: "openai.chat.completions",
		});

		const text = await new Response(transformed).text();
		expect(text).toContain("\"image_url\"");
		expect(text).toContain("\"prompt_tokens\":11");
		expect(text).toContain("\"completion_tokens\":5");
	});
});
