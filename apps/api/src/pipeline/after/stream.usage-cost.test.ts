import { beforeEach, describe, expect, it, vi } from "vitest";

const calculatePricingMock = vi.fn();

vi.mock("../audit", () => ({
	auditSuccess: vi.fn(async () => undefined),
	auditFailure: vi.fn(async () => undefined),
}));

vi.mock("@observability/events", () => ({
	emitGatewayRequestEvent: vi.fn(async () => undefined),
}));

vi.mock("./charge", () => ({
	recordUsageAndChargeOnce: vi.fn(async () => undefined),
}));

vi.mock("@core/provider-rate-limits", () => ({
	recordManagedProviderTokensOnce: vi.fn(async () => undefined),
}));

vi.mock("../execute/health", () => ({
	classifyProviderHealthImpact: () => "success",
	onCallEnd: vi.fn(async () => undefined),
	reportProbeResult: vi.fn(async () => undefined),
	maybeOpenOnRecentErrors: vi.fn(async () => undefined),
}));

vi.mock("../execute/sticky-routing", () => ({
	maybeWriteStickyRoutingFromUsage: vi.fn(async () => undefined),
	resolveCacheAwareRoutingPreference: () => false,
}));

vi.mock("../pricing/byok-fee", () => ({
	applyByokServiceFee: async ({ baseCostNanos, pricedUsage, currencyHint }: any) => ({
		totalCents: Math.round(baseCostNanos / 1e7),
		totalNanos: baseCostNanos,
		currency: currencyHint,
		pricedUsage,
	}),
}));

vi.mock("./pricing", () => ({
	calculatePricing: (usage: any, ...args: any[]) => calculatePricingMock(usage, ...args),
}));

vi.mock("@/runtime/env", () => ({
	ensureRuntimeForBackground: () => () => {},
	dispatchBackground: (promise: Promise<unknown>) => {
		void promise.catch(() => {});
	},
}));

import { handleStreamResponse } from "./stream";

const FRAME_PRICE_NANOS = 2_500_000;

function sse(frames: Array<{ event?: string; data: unknown }>, done = false): Response {
	const body = frames
		.map(({ event, data }) => `${event ? `event: ${event}\n` : ""}data: ${JSON.stringify(data)}\n\n`)
		.join("") + (done ? "data: [DONE]\n\n" : "");
	return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function chatStream(): Response {
	return sse([
		{ data: { id: "chatcmpl_cost", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "hello" }, finish_reason: null }] } },
		{ data: { id: "chatcmpl_cost", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] } },
		{ data: { id: "chatcmpl_cost", object: "chat.completion.chunk", choices: [], usage: { prompt_tokens: 11, completion_tokens: 4, total_tokens: 15 } } },
	], true);
}

function responsesStream(): Response {
	const response = { id: "resp_cost", object: "response", status: "completed", output: [], usage: { input_tokens: 11, output_tokens: 4, total_tokens: 15 } };
	return sse([
		{ event: "response.created", data: { type: "response.created", response: { ...response, status: "in_progress", usage: null } } },
		{ event: "response.completed", data: { type: "response.completed", response } },
	]);
}

function messagesStream(): Response {
	return sse([
		{ event: "message_start", data: { type: "message_start", message: { id: "msg_cost", type: "message", role: "assistant", content: [], model: "claude-sonnet-4-6", usage: { input_tokens: 11, output_tokens: 1 } } } },
		{ event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } },
		{ event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "hello" } } },
		{ event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
		{ event: "message_delta", data: { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { input_tokens: 11, output_tokens: 4 } } },
		{ event: "message_stop", data: { type: "message_stop" } },
	]);
}

function ctxFor(endpoint: string, protocol: string): any {
	return {
		requestId: "req_stream_cost",
		workspaceId: "ws_local_test",
		endpoint,
		protocol,
		capability: "text.generate",
		model: "openai/gpt-5-mini",
		requestedModel: "openai/gpt-5-mini",
		stream: true,
		body: { model: "openai/gpt-5-mini", stream: true },
		rawBody: { model: "openai/gpt-5-mini", stream: true },
		meta: { requestId: "req_stream_cost", apiKeyId: "key_local_test", authMethod: "api_key" },
		providers: [],
		pricing: {},
		gating: {
			key: { ok: true, reason: null, resetAt: null },
			keyLimit: { ok: true, reason: null, resetAt: null },
			credit: { ok: true, reason: null, resetAt: null },
		},
	};
}

async function runStream(ctx: any, upstream: Response, keySource?: string) {
	const response = await handleStreamResponse(ctx, {
		kind: "stream",
		stream: upstream.body,
		upstream,
		provider: "openai",
		keySource,
		usageFinalizer: async () => null,
		bill: { cost_cents: 0, currency: "USD", usage: null, finish_reason: null },
		mappedRequest: null,
		rawResponse: null,
	} as any, { rules: [] } as any);
	const text = await response.text();
	await new Promise((resolve) => setTimeout(resolve, 0));
	return text
		.split("\n")
		.filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
		.map((line) => JSON.parse(line.slice(6)));
}

describe("usage.cost on streamed text responses", () => {
	beforeEach(() => {
		calculatePricingMock.mockReset().mockImplementation((usage: any) => ({
			pricedUsage: {
				...usage,
				pricing: { total_nanos: FRAME_PRICE_NANOS, total_usd_str: "0.002500000", total_cents: 0, currency: "USD", lines: [] },
			},
			totalNanos: FRAME_PRICE_NANOS,
			totalCents: 0,
			currency: "USD",
		}));
	});

	it("adds cost to the final Chat Completions usage chunk", async () => {
		const frames = await runStream(ctxFor("chat.completions", "openai.chat.completions"), chatStream());
		const usage = frames.find((frame) => frame.usage)?.usage;

		expect(usage.cost).toBe(0.0025);
		expect(usage.cost_details).toEqual({ upstream_inference_cost: null });
		expect(usage.pricing.total_nanos).toBe(FRAME_PRICE_NANOS);
		expect(usage.prompt_tokens).toBe(11);
	});

	it("adds cost to the completed Responses usage", async () => {
		const frames = await runStream(ctxFor("responses", "openai.responses"), responsesStream());
		const usage = frames.find((frame) => frame.type === "response.completed")?.response?.usage;

		expect(usage.cost).toBe(0.0025);
		expect(usage.cost_details).toEqual({ upstream_inference_cost: null });
		expect(usage.pricing_breakdown.total_nanos).toBe(FRAME_PRICE_NANOS);
	});

	it("adds cost to the final Messages usage delta", async () => {
		const frames = await runStream(ctxFor("messages", "anthropic.messages"), messagesStream());
		const usage = frames.find((frame) => frame.type === "message_delta")?.usage;

		expect(usage.input_tokens).toBe(11);
		expect(usage.output_tokens).toBe(4);
		expect(usage.cost).toBe(0.0025);
		expect(usage.cost_details).toEqual({ upstream_inference_cost: null });
		// Only the cost fields are added to the Messages usage.
		expect(usage).not.toHaveProperty("pricing");
		expect(usage).not.toHaveProperty("pricing_breakdown");
	});

	it("keeps a Messages stream flowing when the frame cannot be priced", async () => {
		calculatePricingMock.mockImplementation(() => {
			throw new Error("pricing_rule_missing:output_text_tokens");
		});
		const frames = await runStream(ctxFor("messages", "anthropic.messages"), messagesStream());
		const usage = frames.find((frame) => frame.type === "message_delta")?.usage;

		expect(usage.output_tokens).toBe(4);
		expect(usage).not.toHaveProperty("cost");
		expect(frames.at(-1)?.type).toBe("message_stop");
	});

	it("reports a BYOK stream's price as the provider's cost, since the fee settles later", async () => {
		const frames = await runStream(ctxFor("chat.completions", "openai.chat.completions"), chatStream(), "byok");
		const usage = frames.find((frame) => frame.usage)?.usage;

		expect(usage).not.toHaveProperty("cost");
		expect(usage.cost_details).toEqual({ upstream_inference_cost: 0.0025 });
	});
});
