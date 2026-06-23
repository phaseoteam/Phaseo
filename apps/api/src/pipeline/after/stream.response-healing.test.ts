import { describe, expect, it, vi } from "vitest";

const auditSuccessMock = vi.fn();
const emitGatewayRequestEventMock = vi.fn();
const recordUsageAndChargeOnceMock = vi.fn();
const onCallEndMock = vi.fn();
const reportProbeResultMock = vi.fn();
const maybeOpenOnRecentErrorsMock = vi.fn();
const maybeWriteStickyRoutingFromUsageMock = vi.fn();

vi.mock("./audit", () => ({
	handleSuccessAudit: (...args: any[]) => auditSuccessMock(...args),
	handleFailureAudit: vi.fn(),
}));

vi.mock("@observability/events", () => ({
	emitGatewayRequestEvent: (...args: any[]) =>
		emitGatewayRequestEventMock(...args),
}));

vi.mock("./charge", () => ({
	recordUsageAndChargeOnce: (...args: any[]) =>
		recordUsageAndChargeOnceMock(...args),
}));

vi.mock("../execute/health", () => ({
	classifyProviderHealthImpact: ({ upstreamStatus }: { upstreamStatus?: number | null } = {}) => {
		const status = Number(upstreamStatus ?? 0);
		return status >= 200 && status < 500 ? "neutral" : "failure";
	},
	onCallEnd: (...args: any[]) => onCallEndMock(...args),
	reportProbeResult: (...args: any[]) => reportProbeResultMock(...args),
	maybeOpenOnRecentErrors: (...args: any[]) =>
		maybeOpenOnRecentErrorsMock(...args),
}));

vi.mock("../execute/sticky-routing", () => ({
	maybeWriteStickyRoutingFromUsage: (...args: any[]) =>
		maybeWriteStickyRoutingFromUsageMock(...args),
	resolveCacheAwareRoutingPreference: () => false,
}));

vi.mock("../pricing/byok-fee", () => ({
	applyByokServiceFee: async ({
		baseCostNanos,
		pricedUsage,
		currencyHint,
	}: {
		baseCostNanos: number;
		pricedUsage: any;
		currencyHint: string;
	}) => ({
		totalCents: Math.round(baseCostNanos / 1e7),
		totalNanos: baseCostNanos,
		currency: currencyHint,
		pricedUsage,
	}),
}));

vi.mock("./pricing", () => ({
	calculatePricing: (usage: any, _card: any, _body: any, _tier: string) => ({
		pricedUsage: usage,
		totalCents: 0,
		totalNanos: 0,
		currency: "USD",
	}),
}));

vi.mock("@/runtime/env", () => ({
	ensureRuntimeForBackground: () => () => {},
	dispatchBackground: (promise: Promise<unknown>) => {
		void promise.catch(() => {});
	},
}));

import { handleStreamResponse } from "./stream";

function makeSseResponse(frames: Array<{ event?: string; data: any }>): Response {
	const text = frames
		.map((frame) => {
			const eventLine = frame.event ? `event: ${frame.event}\n` : "";
			return `${eventLine}data: ${JSON.stringify(frame.data)}\n\n`;
		})
		.join("");
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(text));
			controller.close();
		},
	});
	return new Response(stream, {
		status: 200,
		headers: { "Content-Type": "text/event-stream" },
	});
}

async function drain(response: Response): Promise<string> {
	return await response.text();
}

function baseCtx(overrides?: Record<string, unknown>): any {
	return {
		requestId: "req_stream_heal_1",
		workspaceId: "ws_stream_heal",
		endpoint: "responses",
		protocol: "openai.responses",
		capability: "text.generate",
		model: "openai/gpt-5.4",
		stream: true,
		body: {
			model: "openai/gpt-5.4",
			text: {
				format: {
					type: "json_schema",
					schema: {
						type: "object",
						required: ["ok"],
						properties: {
							ok: { type: "boolean" },
						},
						additionalProperties: false,
					},
				},
			},
		},
		rawBody: {
			model: "openai/gpt-5.4",
			text: {
				format: {
					type: "json_schema",
					schema: {
						type: "object",
						required: ["ok"],
						properties: {
							ok: { type: "boolean" },
						},
						additionalProperties: false,
					},
				},
			},
		},
		meta: {
			requestId: "req_stream_heal_1",
			apiKeyId: "key_1",
			apiKeyRef: "kid_key_1",
			apiKeyKid: "kid_key_1",
			authMethod: "api_key",
			returnMeta: true,
		},
		plugins: [{ id: "response-healing", enabled: true, config: {} }],
		providers: [],
		pricing: {},
		gating: {
			key: { ok: true, reason: null, resetAt: null },
			keyLimit: { ok: true, reason: null, resetAt: null },
			credit: { ok: true, reason: null, resetAt: null },
		},
		...overrides,
	};
}

describe("handleStreamResponse response healing", () => {
	it("skips response healing for streamed terminal response snapshots and records skipped metadata", async () => {
		auditSuccessMock.mockReset();
		emitGatewayRequestEventMock.mockReset();
		recordUsageAndChargeOnceMock.mockReset();
		onCallEndMock.mockReset();
		reportProbeResultMock.mockReset();
		maybeOpenOnRecentErrorsMock.mockReset();
		maybeWriteStickyRoutingFromUsageMock.mockReset();
		auditSuccessMock.mockResolvedValue(undefined);
		emitGatewayRequestEventMock.mockResolvedValue(undefined);
		recordUsageAndChargeOnceMock.mockResolvedValue(undefined);
		onCallEndMock.mockResolvedValue(undefined);
		reportProbeResultMock.mockResolvedValue(undefined);
		maybeOpenOnRecentErrorsMock.mockResolvedValue(undefined);
		maybeWriteStickyRoutingFromUsageMock.mockResolvedValue(undefined);

		const upstream = makeSseResponse([
			{
				event: "response.completed",
				data: {
					response: {
						id: "resp_stream_heal_1",
						object: "response",
						status: "completed",
						usage: {
							input_tokens: 5,
							output_tokens: 3,
							total_tokens: 8,
						},
						output: [
							{
								type: "message",
								role: "assistant",
								content: [
									{
										type: "output_text",
										text: "```json\n{ok: true,}\n```",
									},
								],
							},
						],
					},
				},
			},
		]);

		const response = await handleStreamResponse(
			baseCtx(),
			{
				kind: "completed",
				upstream,
				provider: "openai",
				generationTimeMs: 120,
				bill: {
					cost_cents: 0,
					currency: "USD",
					usage: null,
					finish_reason: "stop",
					upstream_id: "resp_stream_heal_1",
				},
				mappedRequest: null,
				rawResponse: null,
			} as any,
			null,
		);

		const text = await drain(response);
		await new Promise((resolve) => setTimeout(resolve, 0));
		const finalFrame = JSON.parse(
			text
				.split("\n")
				.find((line) => line.startsWith("data: "))
				?.slice(6) ?? "{}",
		);

		expect(finalFrame.response.output[0].content).toEqual([
			{
				type: "output_text",
				text: "```json\n{ok: true,}\n```",
			},
		]);
		expect(text).toContain('"plugin_executions"');
	});

	it("adds routing diagnostics to streamed terminal frames only when explicitly requested", async () => {
		const upstream = makeSseResponse([
			{
				event: "response.completed",
				data: {
					response: {
						id: "resp_stream_route_1",
						object: "response",
						status: "completed",
						usage: {
							input_tokens: 5,
							output_tokens: 3,
							total_tokens: 8,
						},
						output: [],
					},
				},
			},
		]);

		const response = await handleStreamResponse(
			baseCtx({
				meta: {
					requestId: "req_stream_heal_1",
					apiKeyId: "key_1",
					apiKeyRef: "kid_key_1",
					apiKeyKid: "kid_key_1",
					authMethod: "api_key",
					returnMeta: false,
					returnRoutingDiagnostics: true,
				},
				routingDiagnostics: {
					rankedProviders: [{ providerId: "openai", score: 0.99 }],
				},
			}),
			{
				kind: "completed",
				upstream,
				provider: "openai",
				generationTimeMs: 120,
				bill: {
					cost_cents: 0,
					currency: "USD",
					usage: null,
					finish_reason: "stop",
					upstream_id: "resp_stream_route_1",
				},
				mappedRequest: null,
				rawResponse: null,
			} as any,
			null,
		);

		const text = await drain(response);
		const finalFrame = JSON.parse(
			text
				.split("\n")
				.find((line) => line.startsWith("data: "))
				?.slice(6) ?? "{}",
		);

		expect(finalFrame.routing_diagnostics).toEqual({
			rankedProviders: [{ providerId: "openai", score: 0.99 }],
		});
	});
});
