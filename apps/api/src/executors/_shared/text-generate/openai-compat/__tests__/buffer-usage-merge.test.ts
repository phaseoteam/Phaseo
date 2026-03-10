import { describe, expect, it } from "vitest";
import { bufferStreamToIR } from "../index";

function makeChatSse(frames: any[]): Response {
	const body = frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("") + "data: [DONE]\n\n";
	return new Response(body, {
		headers: { "Content-Type": "text/event-stream" },
	});
}

describe("bufferStreamToIR usage merge", () => {
	it("keeps non-zero completion usage when a later chunk reports prompt-only usage", async () => {
		const upstream = makeChatSse([
			{
				id: "chatcmpl_1",
				object: "chat.completion.chunk",
				created: 1710000000,
				model: "gemma-3-27b-it",
				choices: [{ index: 0, delta: { role: "assistant", content: "Hello" }, finish_reason: null }],
				usage: {
					prompt_tokens: 552,
					completion_tokens: 31,
					total_tokens: 583,
					input_tokens: 552,
					output_tokens: 0,
				},
			},
			{
				id: "chatcmpl_1",
				object: "chat.completion.chunk",
				created: 1710000001,
				model: "gemma-3-27b-it",
				choices: [{ index: 0, delta: { content: " world" }, finish_reason: "stop" }],
				usage: { prompt_tokens: 552, completion_tokens: 0, total_tokens: 552 },
			},
		]);

		const { ir, usage } = await bufferStreamToIR(
			upstream,
			{
				requestId: "req_usage_merge",
				providerId: "google-ai-studio",
				ir: {
					model: "google/gemma-3-27b:free",
					stream: false,
					messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
				},
			} as any,
			"chat",
			Date.now(),
		);

		expect(usage?.completion_tokens).toBe(31);
		expect(usage?.output_tokens).toBe(31);
		expect(usage?.total_tokens).toBe(583);
		expect(ir.usage?.outputTokens).toBe(31);
		expect(ir.usage?.totalTokens).toBe(583);
	});
});
