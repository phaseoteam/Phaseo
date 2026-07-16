import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { handleFailureAudit, handleSuccessAudit } from "./audit";

function createResult(provider = "wafer") {
	return {
		kind: "completed",
		provider,
		apiModelId: "glm-5.2",
		providerModelSlug: "glm-5.2",
		upstream: new Response(null, { status: 200 }),
		generationTimeMs: 80,
		bill: {
			usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
			currency: "USD",
			cost_cents: 0,
			upstream_id: "resp_wafer",
			finish_reason: "stop",
		},
		mappedRequest: JSON.stringify({ model: "glm-5.2", messages: [{ role: "user", content: "hello" }] }),
		rawResponse: {
			id: "resp_wafer",
			choices: [{ finish_reason: "stop", message: { content: "Hello" } }],
		},
		keySource: "gateway",
		timing: { latencyMs: 120, generationMs: 80, totalMs: 200 },
	} as any;
}

function createContext() {
	return {
		requestId: "req_glm",
		workspaceId: "ws_1",
		endpoint: "chat.completions",
		capability: "text.generate",
		requestedModel: "z-ai/glm-5.2",
		model: "z-ai/glm-5.2",
		stream: false,
		body: { model: "z-ai/glm-5.2", messages: [{ role: "user", content: "hello" }] },
		rawBody: { model: "z-ai/glm-5.2", messages: [{ role: "user", content: "hello" }] },
		meta: { apiKeyId: "key_1", authMethod: "api_key" },
		providers: [],
		pricing: {},
		gating: {
			key: { ok: true, reason: null, resetAt: null },
			keyLimit: { ok: true, reason: null, resetAt: null },
			credit: { ok: true, reason: null, resetAt: null },
		},
	} as any;
}

describe("handleSuccessAudit upstream exchanges", () => {
	beforeEach(() => {
		auditSuccessMock.mockReset();
		auditFailureMock.mockReset();
		emitGatewayRequestEventMock.mockReset();
		auditSuccessMock.mockResolvedValue(undefined);
		auditFailureMock.mockResolvedValue(undefined);
		emitGatewayRequestEventMock.mockResolvedValue(undefined);
	});

	it("keeps one API row and records the complete provider failover timeline", async () => {
		const ctx = createContext();
		ctx.providerAttempts = [
			{
				attempt_number: 1,
				round_number: 1,
				provider: "moonshot-ai",
				endpoint: "chat.completions",
				model: "z-ai/glm-5.2",
				api_model_id: "glm-5.2",
				outcome: "upstream_non_2xx",
				duration_ms: 45,
				status: 429,
				upstream_error_code: "rate_limit_exceeded",
				upstream_request: { model: "glm-5.2" },
				upstream_response: { error: { code: "rate_limit_exceeded" } },
			},
			{
				attempt_number: 2,
				round_number: 1,
				provider: "wafer",
				endpoint: "chat.completions",
				model: "z-ai/glm-5.2",
				api_model_id: "glm-5.2",
				outcome: "success",
				duration_ms: 200,
				status: 200,
				native_response_id: "resp_wafer",
				provider_finish_reason: "stop",
				finish_reason: "stop",
				upstream_request: { model: "glm-5.2" },
				upstream_response: { id: "resp_wafer", choices: [{ finish_reason: "stop" }] },
			},
		];

		await handleSuccessAudit(
			ctx,
			createResult(),
			false,
			{ input_tokens: 10, output_tokens: 5, total_tokens: 15 },
			0,
			0,
			"USD",
			"stop",
			200,
			"resp_wafer",
			{ choices: [{ finish_reason: "stop" }] },
		);

		expect(auditSuccessMock).toHaveBeenCalledTimes(1);
		const exchanges = auditSuccessMock.mock.calls[0][0].detailMetadata.upstream_exchanges;
		expect(exchanges).toHaveLength(2);
		expect(exchanges[0]).toEqual(expect.objectContaining({
			provider: "moonshot-ai",
			outcome: "upstream_non_2xx",
			status: 429,
		}));
		expect(exchanges[1]).toEqual(expect.objectContaining({
			provider: "wafer",
			outcome: "success",
			provider_finish_reason: "stop",
			finish_reason: "stop",
		}));
	});

	it("records managed tool rounds as upstream children of one complete gateway request", async () => {
		const ctx = createContext();
		ctx.providerAttempts = [
			{ attempt_number: 1, round_number: 1, provider: "wafer", endpoint: "chat.completions", model: "z-ai/glm-5.2", outcome: "success", duration_ms: 100, status: 200 },
			{ attempt_number: 1, round_number: 2, provider: "wafer", endpoint: "chat.completions", model: "z-ai/glm-5.2", outcome: "success", duration_ms: 200, status: 200 },
		];
		ctx.providerRounds = [
			{
				round_number: 1,
				provider: "wafer",
				api_model_id: "glm-5.2",
				pricing_key: null,
				provider_finish_reason: "tool_calls",
				finish_reason: "tool_calls",
				usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 },
				native_response_id: "resp_tool",
				generation_ms: 40,
				latency_ms: 60,
				total_ms: 100,
				mapped_request: "{\"model\":\"glm-5.2\"}",
				raw_response: { id: "resp_tool", choices: [{ finish_reason: "tool_calls" }] },
				status_code: 200,
				key_source: "gateway",
				byok_key_id: null,
				provider_attempts: [ctx.providerAttempts[0]],
			},
			{
				round_number: 2,
				provider: "wafer",
				api_model_id: "glm-5.2",
				pricing_key: null,
				provider_finish_reason: "stop",
				finish_reason: "stop",
				usage: { input_tokens: 20, output_tokens: 5, total_tokens: 25 },
				native_response_id: "resp_stop",
				generation_ms: 80,
				latency_ms: 120,
				total_ms: 200,
				mapped_request: "{\"model\":\"glm-5.2\"}",
				raw_response: { id: "resp_stop", choices: [{ finish_reason: "stop" }] },
				status_code: 200,
				key_source: "gateway",
				byok_key_id: null,
				provider_attempts: [ctx.providerAttempts[1]],
			},
		];

		await handleSuccessAudit(ctx, createResult(), false, {}, 3.7, 37_000_000, "USD", "stop", 200);

		expect(auditSuccessMock).toHaveBeenCalledTimes(1);
		const parent = auditSuccessMock.mock.calls[0][0];
		expect(parent.requestId).toBe("req_glm");
		expect(parent.keyId).toBe("key_1");
		expect(parent.finishReason).toBe("stop");
		expect(parent.totalNanos).toBe(37_000_000);
		expect(parent.detailMetadata.upstream_exchanges).toHaveLength(2);
		expect(parent.detailMetadata.upstream_exchanges.map((exchange: any) => ({
			round: exchange.round_number,
			finishReason: exchange.finish_reason,
		}))).toEqual([
			{ round: 1, finishReason: "tool_calls" },
			{ round: 2, finishReason: "stop" },
		]);
		expect(emitGatewayRequestEventMock).toHaveBeenCalledTimes(1);
	});

	it("expands executor-level HTTP retries into ordered upstream exchanges", async () => {
		const ctx = createContext();
		ctx.providerAttempts = [{
			attempt_number: 1,
			round_number: 1,
			provider: "baseten",
			endpoint: "chat.completions",
			model: "thinking-machines/inkling",
			outcome: "success",
			duration_ms: 210,
			status: 200,
			provider_finish_reason: "stop",
			finish_reason: "stop",
			upstream_attempts: [
				{
					sequence: 1,
					route: "responses",
					request: { model: "thinkingmachines/inkling" },
					response: { error: { message: "unsupported endpoint" } },
					status: 404,
					duration_ms: 40,
					outcome: "upstream_non_2xx",
				},
				{
					sequence: 2,
					route: "chat",
					request: { model: "thinkingmachines/inkling" },
					status: 200,
					duration_ms: 170,
					outcome: "success",
				},
			],
		}];

		await handleSuccessAudit(ctx, createResult("baseten"), false, {}, 0, 0, "USD", "stop", 210);

		const exchanges = auditSuccessMock.mock.calls[0][0].detailMetadata.upstream_exchanges;
		expect(exchanges).toHaveLength(2);
		expect(exchanges[0]).toEqual(expect.objectContaining({
			sequence: 1,
			internal_attempt_number: 1,
			upstream_route: "responses",
			status: 404,
			finish_reason: null,
		}));
		expect(exchanges[1]).toEqual(expect.objectContaining({
			sequence: 2,
			internal_attempt_number: 2,
			upstream_route: "chat",
			status: 200,
			finish_reason: "stop",
		}));
	});

	it("keeps every failed provider attempt on an ultimately failed gateway request", async () => {
		const ctx = createContext();
		ctx.providerAttempts = [
			{
				attempt_number: 1,
				provider: "moonshot-ai",
				endpoint: "chat.completions",
				model: "z-ai/glm-5.2",
				outcome: "upstream_non_2xx",
				duration_ms: 30,
				status: 429,
				upstream_request: { model: "glm-5.2" },
				upstream_response: { error: { message: "rate limited" } },
			},
			{
				attempt_number: 2,
				provider: "wafer",
				endpoint: "chat.completions",
				model: "z-ai/glm-5.2",
				outcome: "upstream_non_2xx",
				duration_ms: 70,
				status: 503,
				upstream_request: { model: "glm-5.2" },
				upstream_response: { error: { message: "temporarily unavailable" } },
			},
		];
		const result = {
			...createResult("wafer"),
			upstream: new Response(null, { status: 503 }),
			rawResponse: { error: { message: "temporarily unavailable" } },
		};

		await handleFailureAudit(
			ctx,
			result,
			503,
			"provider",
			"upstream_error",
			"All providers failed",
			result.rawResponse,
		);

		expect(auditFailureMock).toHaveBeenCalledTimes(1);
		const logged = auditFailureMock.mock.calls[0][0];
		expect(logged.requestId).toBe("req_glm");
		expect(logged.keyId).toBe("key_1");
		expect(logged.detailMetadata.upstream_exchanges).toHaveLength(2);
		expect(logged.detailMetadata.upstream_exchanges.map((exchange: any) => ({
			provider: exchange.provider,
			status: exchange.status,
			outcome: exchange.outcome,
		}))).toEqual([
			{ provider: "moonshot-ai", status: 429, outcome: "upstream_non_2xx" },
			{ provider: "wafer", status: 503, outcome: "upstream_non_2xx" },
		]);
	});
});
