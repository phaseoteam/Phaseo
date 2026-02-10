import { describe, expect, it } from "vitest";
import { enrichSuccessPayload } from "@pipeline/after/payload";

describe("responses output id preservation", () => {
	it("preserves native upstream output ids when raw output exists", async () => {
		const ctx: any = {
			endpoint: "responses",
			protocol: "openai.responses",
			requestId: "G-01TESTREQID",
			model: "openai/gpt-4.1-nano",
			body: {},
			meta: {
				startedAtMs: Date.now() - 500,
			},
		};

		const result: any = {
			provider: "openai",
			ir: {
				id: "G-01TESTREQID",
				model: "openai/gpt-4.1-nano",
				provider: "openai",
				choices: [
					{
						index: 0,
						finishReason: "stop",
						message: {
							role: "assistant",
							content: [
								{ type: "reasoning_text", text: "gateway reasoning fallback" },
								{ type: "text", text: "gateway text fallback" },
							],
							toolCalls: [],
						},
					},
				],
				usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3, _ext: {} },
			},
			rawResponse: {
				id: "resp_native_123",
				object: "response",
				status: "completed",
				model: "gpt-4.1-nano",
				output: [
					{
						type: "reasoning",
						id: "rs_native_abc",
						status: "completed",
						content: [{ type: "summary_text", text: "native reasoning" }],
					},
					{
						type: "message",
						id: "msg_native_xyz",
						status: "completed",
						role: "assistant",
						content: [{ type: "output_text", text: "native text", annotations: [] }],
					},
				],
				usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
			},
		};

		const payload = await enrichSuccessPayload(ctx, result);
		expect(payload.output?.[0]?.id).toBe("rs_native_abc");
		expect(payload.output?.[1]?.id).toBe("msg_native_xyz");
		expect(payload.output?.[0]?.id).not.toContain("reasoning_G-01TESTREQID");
	});

	it("falls back to IR-generated output when raw output is absent", async () => {
		const ctx: any = {
			endpoint: "responses",
			protocol: "openai.responses",
			requestId: "G-01TESTREQID2",
			model: "openai/gpt-4.1-nano",
			body: {},
			meta: {
				startedAtMs: Date.now() - 500,
			},
		};

		const result: any = {
			provider: "openai",
			ir: {
				id: "G-01TESTREQID2",
				model: "openai/gpt-4.1-nano",
				provider: "openai",
				choices: [
					{
						index: 0,
						finishReason: "stop",
						message: {
							role: "assistant",
							content: [
								{ type: "reasoning_text", text: "gateway reasoning fallback" },
								{ type: "text", text: "gateway text fallback" },
							],
							toolCalls: [],
						},
					},
				],
				usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3, _ext: {} },
			},
			rawResponse: {
				id: "resp_native_456",
				object: "response",
				status: "completed",
				model: "gpt-4.1-nano",
				usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
			},
		};

		const payload = await enrichSuccessPayload(ctx, result);
		expect(payload.output?.[0]?.id).toContain("reasoning_G-01TESTREQID2");
		expect(payload.output?.[1]?.id).toBe("msg_G-01TESTREQID2_0");
	});
});
