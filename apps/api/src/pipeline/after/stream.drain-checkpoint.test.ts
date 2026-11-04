import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A client that disconnects leaves the upstream draining in waitUntil, which the runtime may
// stop about 30 s later, before the final usage arrives. These tests run the real stream
// handler and charge helper; only the database charge call is mocked.
// One-off charges ("one_off") and stored-total charges ("total", see gateway_charge_request_total).
const chargeRpcMock = vi.hoisted(() => vi.fn(async (_kind: string, _args: any) => ({ applied: true })));
const backgroundWork: Promise<unknown>[] = [];

vi.mock("../pricing/persist", () => ({
	recordUsageAndCharge: (args: any) => chargeRpcMock("one_off", args),
	recordRequestChargeTotal: (args: any) => chargeRpcMock("total", args),
}));
vi.mock("./audit", () => ({
	handleFailureAudit: vi.fn(async () => undefined),
	handleSuccessAudit: vi.fn(async () => undefined),
}));
vi.mock("@observability/events", () => ({ emitGatewayRequestEvent: vi.fn(async () => undefined) }));
vi.mock("@core/provider-rate-limits", () => ({ recordManagedProviderTokensOnce: vi.fn(async () => undefined) }));
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
		totalCents: baseCostNanos / 1e7, totalNanos: baseCostNanos, currency: currencyHint, pricedUsage,
	}),
}));
// $1 per million input tokens, $10 per million output tokens.
vi.mock("./pricing", () => ({
	calculatePricing: (usage: any) => {
		const input = Number(usage?.input_tokens ?? usage?.prompt_tokens ?? 0);
		const output = Number(usage?.output_tokens ?? usage?.completion_tokens ?? 0);
		const totalNanos = input * 1_000 + output * 10_000;
		return { pricedUsage: { ...usage, pricing: { total_nanos: totalNanos } }, totalCents: totalNanos / 1e7, totalNanos, currency: "USD" };
	},
}));
vi.mock("@/runtime/env", () => ({
	ensureRuntimeForBackground: () => () => {},
	dispatchBackground: (promise: Promise<unknown>) => { backgroundWork.push(promise.catch(() => {})); },
}));

import { handleStreamResponse } from "./stream";

const enc = new TextEncoder();
const tick = () => new Promise((resolve) => setImmediate(resolve));
// Background work includes the stream pump itself, which runs until the upstream closes.
async function settle() {
	for (let i = 0; i < 30; i += 1) await tick();
}

function controllableUpstream() {
	let controller!: ReadableStreamDefaultController<Uint8Array>;
	const body = new ReadableStream<Uint8Array>({ start(c) { controller = c; } });
	const chunk = (delta: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
		controller.enqueue(enc.encode(`data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: null }], ...extra })}\n\n`));
	return {
		response: new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
		text: (content: string, usage?: Record<string, number>) => chunk({ content }, usage ? { usage } : {}),
		// The upstream closes with no terminal event and no error.
		cut: () => controller.close(),
		finish: (usage: Record<string, number>) => {
			controller.enqueue(enc.encode(`data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`));
			controller.enqueue(enc.encode(`data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", choices: [], usage })}\n\n`));
			controller.enqueue(enc.encode("data: [DONE]\n\n"));
			controller.close();
		},
		// A provider error mid-stream, then the upstream closes with no terminal event.
		fail: () => {
			controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: { message: "overloaded", type: "server_error" } })}\n\n`));
			controller.close();
		},
	};
}

function ctx(): any {
	return {
		requestId: "req_drain",
		billingRequestId: "bill_drain",
		workspaceId: "ws_drain",
		endpoint: "chat.completions",
		protocol: "openai.chat.completions",
		capability: "text.generate",
		model: "openai/gpt-5-mini",
		requestedModel: "openai/gpt-5-mini",
		stream: true,
		// 500 characters of prompt text: not estimated (a cached prompt costs less than the full rate).
		body: { model: "openai/gpt-5-mini", stream: true, messages: [{ role: "user", content: "x".repeat(500) }] },
		rawBody: {},
		meta: { requestId: "req_drain", apiKeyId: "key_drain", authMethod: "api_key" },
		providers: [],
		pricing: {},
		gating: { key: { ok: true }, keyLimit: { ok: true }, credit: { ok: true } },
	};
}

async function start(c: any, keySource = "gateway") {
	const upstream = controllableUpstream();
	const response = await handleStreamResponse(c, {
		kind: "stream", stream: upstream.response.body, upstream: upstream.response, provider: "openai", keySource,
		usageFinalizer: async () => null,
		bill: { cost_cents: 0, currency: "USD", usage: null, finish_reason: null },
		mappedRequest: null, rawResponse: null,
	} as any, { rules: [], currency: "USD" } as any);
	return { upstream, reader: response.body!.getReader() };
}

const charges = () => chargeRpcMock.mock.calls.map(([kind, args]) => kind === "one_off"
	? ["one_off", args.requestId, args.cost_nanos]
	: [args.final ? "final_total" : "checkpoint_total", args.requestId, args.total_nanos]);

describe("a stream the client abandons while the upstream keeps draining", () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		chargeRpcMock.mockClear();
		backgroundWork.length = 0;
	});
	afterEach(() => { vi.useRealTimers(); });

	it("charges what was generated at each checkpoint, then only the rest at the end", async () => {
		const c = ctx();
		const { upstream, reader } = await start(c);
		upstream.text("Hello");
		await reader.read();
		await reader.cancel();
		upstream.text("y".repeat(495));
		await settle();
		expect(charges()).toEqual([]);

		// 15 s after the disconnect: no input reported yet, so only 500 chars = 100 output tokens.
		await vi.advanceTimersByTimeAsync(15_000);
		await settle();
		expect(charges()).toEqual([["checkpoint_total", "bill_drain", 100 * 10_000]]);

		// 25 s: 500 more characters; the database charges only the increase over the stored total.
		upstream.text("z".repeat(500));
		await settle();
		await vi.advanceTimersByTimeAsync(10_000);
		await settle();
		expect(charges()).toEqual([
			["checkpoint_total", "bill_drain", 1_000_000],
			["checkpoint_total", "bill_drain", 2_000_000],
		]);

		// The drain finishes: the final bill is sent as the request's total, not a one-off charge.
		upstream.finish({ prompt_tokens: 120, completion_tokens: 250, total_tokens: 370 });
		await settle();
		expect(charges()).toEqual([
			["checkpoint_total", "bill_drain", 1_000_000],
			["checkpoint_total", "bill_drain", 2_000_000],
			["final_total", "bill_drain", 120 * 1_000 + 250 * 10_000],
		]);
	});

	it("charges once, from the final usage, when the drain finishes before the first checkpoint", async () => {
		const c = ctx();
		const { upstream, reader } = await start(c);
		upstream.text("Hello");
		await reader.read();
		await reader.cancel();
		await vi.advanceTimersByTimeAsync(10_000);
		upstream.finish({ prompt_tokens: 120, completion_tokens: 250, total_tokens: 370 });
		await settle();
		await vi.advanceTimersByTimeAsync(30_000);
		await settle();
		expect(charges()).toEqual([["one_off", "bill_drain", 120 * 1_000 + 250 * 10_000]]);
	});

	it("makes no provisional charge while the client is still reading", async () => {
		const c = ctx();
		const { upstream, reader } = await start(c);
		upstream.text("Hello");
		await reader.read();
		await vi.advanceTimersByTimeAsync(30_000);
		await settle();
		expect(charges()).toEqual([]);
		upstream.finish({ prompt_tokens: 120, completion_tokens: 250, total_tokens: 370 });
		const rest = (async () => { while (!(await reader.read()).done) { /* drain */ } })();
		await settle();
		await rest;
		expect(charges()).toEqual([["one_off", "bill_drain", 2_620_000]]);
	});

	it("makes no provisional charge for a BYOK request", async () => {
		const c = ctx();
		const { upstream, reader } = await start(c, "byok");
		upstream.text("y".repeat(500));
		await reader.read();
		await reader.cancel();
		await vi.advanceTimersByTimeAsync(30_000);
		await settle();
		expect(charges()).toEqual([]);
	});

	it("refunds the checkpoint charges when the upstream then fails", async () => {
		const c = ctx();
		const { upstream, reader } = await start(c);
		upstream.text("y".repeat(500));
		await reader.read();
		await reader.cancel();
		await vi.advanceTimersByTimeAsync(15_000);
		await settle();
		expect(charges()).toEqual([["checkpoint_total", "bill_drain", 1_000_000]]);
		upstream.fail();
		await settle();
		// A failed stream is not billed: a final total of 0 gives the estimate back.
		expect(charges()).toEqual([["checkpoint_total", "bill_drain", 1_000_000], ["final_total", "bill_drain", 0]]);
	});

	it("settles a stream the client left that then ends early at no more than the checkpoints estimated", async () => {
		const c = ctx();
		const { upstream, reader } = await start(c);
		upstream.text("y".repeat(500));
		await reader.read();
		await reader.cancel();
		await vi.advanceTimersByTimeAsync(15_000);
		await settle();
		upstream.text("z".repeat(500));
		upstream.cut();
		await settle();
		// No provider usage: the final total is capped at the 1,000,000 already estimated.
		expect(charges()).toEqual([["checkpoint_total", "bill_drain", 1_000_000], ["final_total", "bill_drain", 1_000_000]]);
	});

	it("settles a stream the client left that then ends early from the provider's reported usage", async () => {
		const c = ctx();
		const { upstream, reader } = await start(c);
		upstream.text("y".repeat(500), { prompt_tokens: 120, completion_tokens: 50, total_tokens: 170 });
		await reader.read();
		await reader.cancel();
		await vi.advanceTimersByTimeAsync(15_000);
		await settle();
		// Reported input (120) plus the streamed output (100 tokens, above the reported 50).
		expect(charges()).toEqual([["checkpoint_total", "bill_drain", 120 * 1_000 + 100 * 10_000]]);
		upstream.text("z".repeat(500));
		upstream.cut();
		await settle();
		expect(charges()).toEqual([
			["checkpoint_total", "bill_drain", 1_120_000],
			["final_total", "bill_drain", 120 * 1_000 + 200 * 10_000],
		]);
	});
});
