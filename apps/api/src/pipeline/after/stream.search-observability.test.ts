import { describe, expect, it, vi } from "vitest";

const auditSuccessMock = vi.fn();
const emitGatewayRequestEventMock = vi.fn();
const recordUsageAndChargeOnceMock = vi.fn();
const onCallEndMock = vi.fn();
const reportProbeResultMock = vi.fn();
const maybeOpenOnRecentErrorsMock = vi.fn();
const maybeWriteStickyRoutingFromUsageMock = vi.fn();
const classifyProviderHealthImpactMock = vi.fn();

vi.mock("../audit", () => ({
	auditSuccess: (...args: any[]) => auditSuccessMock(...args),
	auditFailure: vi.fn(),
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
	classifyProviderHealthImpact: (...args: any[]) =>
		classifyProviderHealthImpactMock(...args),
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
		requestId: "req_stream_search_1",
		workspaceId: "ws_search",
		endpoint: "responses",
		protocol: "openai.responses",
		capability: "text.generate",
		model: "openai/gpt-5.4",
		stream: true,
		body: {
			model: "openai/gpt-5.4",
			tools: [{ type: "web_search_preview_2025_03_11" }],
		},
		rawBody: {
			model: "openai/gpt-5.4",
			tools: [{ type: "web_search_preview_2025_03_11" }],
		},
		meta: {
			requestId: "req_stream_search_1",
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
		...overrides,
	};
}

describe("handleStreamResponse search observability", () => {
	it("persists normalized native-search metadata from streamed response completion snapshots", async () => {
		auditSuccessMock.mockReset();
		emitGatewayRequestEventMock.mockReset();
		recordUsageAndChargeOnceMock.mockReset();
		onCallEndMock.mockReset();
		reportProbeResultMock.mockReset();
		maybeOpenOnRecentErrorsMock.mockReset();
		maybeWriteStickyRoutingFromUsageMock.mockReset();
		classifyProviderHealthImpactMock.mockReset();
		auditSuccessMock.mockResolvedValue(undefined);
		emitGatewayRequestEventMock.mockResolvedValue(undefined);
		recordUsageAndChargeOnceMock.mockResolvedValue(undefined);
		onCallEndMock.mockResolvedValue(undefined);
		reportProbeResultMock.mockResolvedValue(undefined);
		maybeOpenOnRecentErrorsMock.mockResolvedValue(undefined);
		maybeWriteStickyRoutingFromUsageMock.mockResolvedValue(undefined);
		classifyProviderHealthImpactMock.mockReturnValue("success");

		const upstream = makeSseResponse([
			{
				event: "response.completed",
				data: {
					response: {
						id: "resp_stream_search_1",
						object: "response",
						status: "completed",
						usage: {
							input_tokens: 5,
							output_tokens: 3,
							total_tokens: 8,
						},
						output: [
							{
								type: "web_search_call",
								query: "ai stats stream search observability",
								status: "completed",
							},
							{
								type: "message",
								role: "assistant",
								content: [
									{
										type: "output_text",
										text: "Grounded streamed answer",
										annotations: [
											{
												type: "url_citation",
												title: "Phaseo Docs",
												url: "https://example.com/docs",
												quoted_text: "Useful streamed source text",
											},
										],
									},
									{
										type: "web_search_result",
										title: "Phaseo Docs",
										url: "https://example.com/docs",
										text: "Docs summary",
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
					upstream_id: "resp_stream_search_1",
				},
				mappedRequest: null,
				rawResponse: null,
			} as any,
			null,
		);

		await drain(response);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(auditSuccessMock).toHaveBeenCalledTimes(1);
		const call = auditSuccessMock.mock.calls[0][0];
		expect(call.detailMetadata.search_observability).toEqual({
			usedNativeWebSearch: true,
			usedManagedWebSearch: false,
			resultCount: 1,
			citationCount: 1,
			results: [
				{
					type: "web_search_result",
					title: "Phaseo Docs",
					url: "https://example.com/docs",
					snippet: "Docs summary",
				},
			],
			citations: [
				{
					type: "url_citation",
					title: "Phaseo Docs",
					url: "https://example.com/docs",
					text: "Useful streamed source text",
				},
			],
			nativeSearches: [
				{
					type: "web_search_call",
					query: "ai stats stream search observability",
					status: "completed",
				},
			],
			managedSearches: [],
		});
	});

	it("persists managed server-search metadata on streamed success responses", async () => {
		auditSuccessMock.mockReset();
		emitGatewayRequestEventMock.mockReset();
		recordUsageAndChargeOnceMock.mockReset();
		onCallEndMock.mockReset();
		reportProbeResultMock.mockReset();
		maybeOpenOnRecentErrorsMock.mockReset();
		maybeWriteStickyRoutingFromUsageMock.mockReset();
		classifyProviderHealthImpactMock.mockReset();
		auditSuccessMock.mockResolvedValue(undefined);
		emitGatewayRequestEventMock.mockResolvedValue(undefined);
		recordUsageAndChargeOnceMock.mockResolvedValue(undefined);
		onCallEndMock.mockResolvedValue(undefined);
		reportProbeResultMock.mockResolvedValue(undefined);
		maybeOpenOnRecentErrorsMock.mockResolvedValue(undefined);
		maybeWriteStickyRoutingFromUsageMock.mockResolvedValue(undefined);
		classifyProviderHealthImpactMock.mockReturnValue("success");

		const upstream = makeSseResponse([
			{
				event: "response.completed",
				data: {
					response: {
						id: "resp_stream_managed_search_1",
						object: "response",
						status: "completed",
						usage: {
							input_tokens: 7,
							output_tokens: 4,
							total_tokens: 11,
						},
						output: [
							{
								type: "message",
								role: "assistant",
								content: [{ type: "output_text", text: "Managed grounded answer" }],
							},
						],
					},
				},
			},
		]);

		const response = await handleStreamResponse(
			baseCtx({
				requestId: "req_stream_managed_search_1",
				body: {
					model: "openai/gpt-5.4",
					tools: [
						{
							type: "function",
							function: { name: "ai_stats_web_search" },
						},
					],
				},
				rawBody: {
					model: "openai/gpt-5.4",
					tools: [{ type: "ai-stats:web_search" }],
				},
				searchObservability: {
					usedNativeWebSearch: false,
					usedManagedWebSearch: true,
					resultCount: 1,
					citationCount: 1,
					results: [
						{
							type: null,
							title: "Phaseo Docs",
							url: "https://example.com/docs",
							snippet: "Managed summary",
						},
					],
					citations: [
						{
							type: "managed_web_search_result",
							title: "Phaseo Docs",
							url: "https://example.com/docs",
							text: "Managed highlight",
						},
					],
					nativeSearches: [],
					managedSearches: [
						{
							provider: "exa",
							query: "ai stats docs",
							requestId: "req_exa_stream_1",
							searchType: "auto",
							resultCount: 1,
						},
					],
				},
				meta: {
					requestId: "req_stream_managed_search_1",
					apiKeyId: "key_1",
					apiKeyRef: "kid_key_1",
					apiKeyKid: "kid_key_1",
					authMethod: "api_key",
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
					upstream_id: "resp_stream_managed_search_1",
				},
				mappedRequest: null,
				rawResponse: null,
			} as any,
			null,
		);

		await drain(response);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(auditSuccessMock).toHaveBeenCalledTimes(1);
		const call = auditSuccessMock.mock.calls[0][0];
		expect(call.detailMetadata.search_observability).toEqual({
			usedNativeWebSearch: false,
			usedManagedWebSearch: true,
			resultCount: 1,
			citationCount: 1,
			results: [
				{
					type: null,
					title: "Phaseo Docs",
					url: "https://example.com/docs",
					snippet: "Managed summary",
				},
			],
			citations: [
				{
					type: "managed_web_search_result",
					title: "Phaseo Docs",
					url: "https://example.com/docs",
					text: "Managed highlight",
				},
			],
			nativeSearches: [],
			managedSearches: [
				{
					provider: "exa",
					query: "ai stats docs",
					requestId: "req_exa_stream_1",
					searchType: "auto",
					resultCount: 1,
				},
			],
		});
	});
});
