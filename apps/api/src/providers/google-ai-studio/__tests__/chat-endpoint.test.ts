import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exec } from "../endpoints/chat";
import { installFetchMock } from "../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";

function sseResponse(frames: any[]) {
	const payload = `${frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("")}`;
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

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

describe("google-ai-studio chat endpoint", () => {
	it("always streams upstream even when the client requested a buffered response", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) =>
					String(url).includes(":streamGenerateContent") &&
					String(url).includes("models/gemini-2.5-flash"),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
				response: sseResponse([
					{
						responseId: "resp_google_1",
						usageMetadata: {
							promptTokenCount: 4,
							totalTokenCount: 7,
						},
						candidates: [
							{
								content: {
									parts: [{ text: "ok" }],
								},
								finishReason: "STOP",
							},
						],
					},
				]),
			},
		]);

		const result = await exec({
			endpoint: "chat.completions",
			model: "google/gemini-2.5-flash",
			body: {
				model: "google/gemini-2.5-flash",
				stream: false,
				messages: [{ role: "user", content: "hello" }],
			},
			meta: {
				requestId: "req_google_chat_stream_force",
				apiKeyId: "key_test",
				apiKeyRef: "kid_test",
				apiKeyKid: "kid_test",
			},
			workspaceId: "team_test",
			providerId: "google-ai-studio",
			byokMeta: [],
			pricingCard: { rules: [] } as any,
			providerModelSlug: "gemini-2.5-flash",
			stream: false,
		} as any);

		mock.restore();

		expect(mock.calls[0]?.url).toContain(":streamGenerateContent");
		expect(capturedBody?.generationConfig).toBeTruthy();
		expect(result.kind).toBe("completed");
	});
});
