import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exec } from "../endpoints/chat";
import { installFetchMock } from "../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";

const REQUEST_META = {
	requestId: "req_test_mistral_chat_1",
	apiKeyId: "key_test",
	apiKeyRef: "kid_test",
	apiKeyKid: "kid_test",
};

const PRICING_CARD = {
	provider: "mistral",
	model: "mistral/mistral-small-4",
	endpoint: "chat.completions",
	effective_from: null,
	effective_to: null,
	currency: "USD",
	version: null,
	rules: [],
} as any;

function sseResponse(frames: any[]) {
	const payload = `${frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("")}data: [DONE]\n\n`;
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(payload));
			controller.close();
		},
	});
	return new Response(stream, {
		status: 200,
		headers: { "Content-Type": "text/event-stream" },
	});
}

function buildArgs(body: Record<string, unknown>, stream = false) {
	return {
		endpoint: "chat.completions",
		model: "mistral/mistral-small-4",
		body,
		meta: { ...REQUEST_META },
		teamId: "team_test",
		providerId: "mistral",
		byokMeta: [],
		pricingCard: PRICING_CARD,
		providerModelSlug: "mistral-small-latest",
		stream,
	} as any;
}

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

describe("Mistral OpenAI-compatible chat mapping", () => {
	it("forwards reasoning_effort=none upstream for mistral", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/chat/completions"),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
				response: sseResponse([
					{
						id: "cmpl_1",
						created: 1773703500,
						choices: [{ index: 0, delta: { content: "ok" }, finish_reason: "stop" }],
						usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
					},
				]),
			},
		]);

		await exec(
			buildArgs({
				model: "mistral/mistral-small-4",
				messages: [{ role: "user", content: "hello" }],
				reasoning: { effort: "none" },
			}),
		);

		mock.restore();

		expect(capturedBody.reasoning_effort).toBe("none");
	});

	it("requires mistral reasoning_effort to be none or high", async () => {
		await expect(
			exec(
				buildArgs({
					model: "mistral/mistral-small-4",
					messages: [{ role: "user", content: "hello" }],
					reasoning: { effort: "medium" },
				}),
			),
		).rejects.toThrow("mistral_invalid_reasoning_effort");
	});

	it("normalizes mistral thinking blocks into reasoning_content", async () => {
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/chat/completions"),
				response: sseResponse([
					{
						id: "929e0c2c2de8434a929c02c09e69dfaa",
						created: 1773703500,
						choices: [{
							index: 0,
							delta: {
								content: [
									{
										type: "thinking",
										thinking: [{ type: "text", text: "Reasoning text from model." }],
									},
									{
										type: "text",
										text: "Final answer text.",
									},
								],
							},
							finish_reason: null,
						}],
					},
					{
						id: "929e0c2c2de8434a929c02c09e69dfaa",
						created: 1773703500,
						choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
						usage: { prompt_tokens: 21, completion_tokens: 322, total_tokens: 343 },
					},
				]),
			},
		]);

		const result = await exec(
			buildArgs({
				model: "mistral/mistral-small-4",
				messages: [{ role: "user", content: "Why is fast inference important?" }],
				reasoning: { effort: "high" },
			}),
		);

		mock.restore();

		expect(result.kind).toBe("completed");
		expect(result.normalized?.choices?.[0]?.message?.content).toContain("Final answer text.");
		expect(result.normalized?.choices?.[0]?.message?.reasoning_content).toContain("Reasoning text from model.");
		expect(result.normalized?.choices?.[0]?.message?.reasoning_details?.[0]?.type).toBe("text");
	});
});
