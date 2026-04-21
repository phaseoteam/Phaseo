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
		workspaceId: "team_test",
		providerId: "mistral",
		byokMeta: [],
		pricingCard: PRICING_CARD,
		providerModelSlug: "mistral-small-latest",
		stream,
	} as any;
}

function buildArgsWithOverrides(
	body: Record<string, unknown>,
	overrides: Partial<Record<string, unknown>>,
	stream = false,
) {
	return {
		...buildArgs(body, stream),
		...overrides,
	} as any;
}

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

describe("Mistral OpenAI-compatible chat mapping", () => {
	it("defaults reasoning off for mistral when no reasoning controls are provided", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/chat/completions"),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
				response: sseResponse([
					{
						id: "cmpl_default_none",
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
			}),
		);

		mock.restore();

		expect(capturedBody.reasoning_effort).toBe("none");
	});

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

	it("coerces non-none reasoning efforts to high for mistral", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/chat/completions"),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
				response: sseResponse([
					{
						id: "cmpl_effort_high",
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
				reasoning: { effort: "medium" },
			}),
		);

		mock.restore();

		expect(capturedBody.reasoning_effort).toBe("high");
	});

	it("maps reasoning.enabled=true to reasoning_effort=high for mistral", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/chat/completions"),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
				response: sseResponse([
					{
						id: "cmpl_enabled_high",
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
				reasoning: { enabled: true },
			}),
		);

		mock.restore();

		expect(capturedBody.reasoning_effort).toBe("high");
	});

	it("does not send reasoning_effort for non-Small-4 mistral routes", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/chat/completions"),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
				response: sseResponse([
					{
						id: "cmpl_small32",
						created: 1773703500,
						choices: [{ index: 0, delta: { content: "ok" }, finish_reason: "stop" }],
						usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
					},
				]),
			},
		]);

		await exec(
			buildArgsWithOverrides(
				{
					model: "mistral/mistral-small-3-2-2025-06-20",
					messages: [{ role: "user", content: "hello" }],
					reasoning: { enabled: true },
				},
				{
					model: "mistral/mistral-small-3-2-2025-06-20",
					providerModelSlug: "mistral-small-latest",
				},
			),
		);

		mock.restore();

		expect(capturedBody.reasoning_effort).toBeUndefined();
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
