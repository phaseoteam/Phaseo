import { describe, expect, it } from "vitest";
import { bufferStreamToIR } from "../index";

describe("bufferStreamToIR non-SSE fallback", () => {
	it("parses plain JSON response bodies when upstream ignores stream", async () => {
		const upstream = new Response(
			JSON.stringify({
				response: {
					id: "resp_123",
					object: "response",
					created_at: 1710000000,
					model: "gpt-4.1-mini",
					output: [
						{
							type: "message",
							role: "assistant",
							content: [{ type: "output_text", text: "hello" }],
						},
					],
					usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
				},
			}),
			{ headers: { "Content-Type": "application/json" } },
		);

		const { ir, usage } = await bufferStreamToIR(
			upstream,
			{
				requestId: "req_non_sse",
				providerId: "openai",
				ir: {
					model: "openai/gpt-4.1-mini",
					stream: false,
					messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
				},
			} as any,
			"responses",
			Date.now(),
		);

		expect(ir.nativeId).toBe("resp_123");
		expect(ir.choices?.[0]?.message?.content?.[0]).toEqual({ type: "text", text: "hello" });
		expect(usage).toEqual({ input_tokens: 3, output_tokens: 2, total_tokens: 5 });
	});
});

