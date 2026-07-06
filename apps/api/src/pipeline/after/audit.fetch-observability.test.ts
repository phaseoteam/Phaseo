import { describe, expect, it, vi } from "vitest";

const auditSuccessMock = vi.fn();
const auditFailureMock = vi.fn();
const emitGatewayRequestEventMock = vi.fn();

vi.mock("../audit", () => ({
	auditSuccess: (...args: any[]) => auditSuccessMock(...args),
	auditFailure: (...args: any[]) => auditFailureMock(...args),
}));

vi.mock("@observability/events", () => ({
	emitGatewayRequestEvent: (...args: any[]) => emitGatewayRequestEventMock(...args),
}));

import { handleSuccessAudit } from "./audit";

describe("handleSuccessAudit web fetch observability", () => {
	it("persists managed web-fetch metadata into request detail payloads", async () => {
		auditSuccessMock.mockReset();
		auditFailureMock.mockReset();
		emitGatewayRequestEventMock.mockReset();
		auditSuccessMock.mockResolvedValue(undefined);
		emitGatewayRequestEventMock.mockResolvedValue(undefined);

		await handleSuccessAudit(
			{
				requestId: "req_fetch_1",
				workspaceId: "ws_fetch",
				endpoint: "responses",
				capability: "text.generate",
				model: "openai/gpt-5.4",
				stream: false,
				body: {
					model: "openai/gpt-5.4",
					tools: [{ type: "function", function: { name: "phaseo_web_fetch" } }],
				},
				rawBody: {
					model: "openai/gpt-5.4",
					tools: [{ type: "phaseo:web_fetch" }],
				},
				webFetchObservability: {
					requestCount: 1,
					fetches: [
						{
							provider: "fetch",
							url: "https://example.com/docs",
							finalUrl: "https://www.example.com/docs",
							title: "Phaseo Docs",
							status: 200,
							contentType: "text/html; charset=utf-8",
							returnedChars: 12000,
							truncated: true,
						},
					],
				},
				meta: {
					requestId: "req_fetch_1",
					apiKeyId: "key_1",
					apiKeyRef: "kid_key_1",
					apiKeyKid: "kid_key_1",
					authMethod: "api_key",
				},
				providers: [],
				pricing: {},
				gating: {
					key: { ok: true, reason: null, resetAt: null },
					keyLimit: { ok: true, reason: null, resetAt: null },
					credit: { ok: true, reason: null, resetAt: null },
				},
			} as any,
			{
				kind: "completed",
				upstream: new Response("{}", {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
				provider: "openai",
				generationTimeMs: 120,
				bill: {
					cost_cents: 0,
					currency: "USD",
					usage: null,
					finish_reason: "stop",
				},
				mappedRequest: null,
				rawResponse: {
					output: [
						{
							type: "message",
							role: "assistant",
							content: [{ type: "output_text", text: "Grounded answer" }],
						},
					],
				},
			} as any,
			false,
			{ output_tokens: 12, total_tokens: 12 },
			0,
			0,
			"USD",
			"stop",
			200,
			"resp_fetch_1",
			{ id: "resp_fetch_1" },
		);

		expect(auditSuccessMock).toHaveBeenCalledTimes(1);
		const call = auditSuccessMock.mock.calls[0][0];
		expect(call.detailMetadata.web_fetch_observability).toEqual({
			requestCount: 1,
			fetches: [
				{
					provider: "fetch",
					url: "https://example.com/docs",
					finalUrl: "https://www.example.com/docs",
					title: "Phaseo Docs",
					status: 200,
					contentType: "text/html; charset=utf-8",
					returnedChars: 12000,
					truncated: true,
				},
			],
		});

		const extraJson = JSON.parse(call.extraJson);
		expect(extraJson.transform.web_fetch_observability).toEqual(
			call.detailMetadata.web_fetch_observability,
		);
	});
});
