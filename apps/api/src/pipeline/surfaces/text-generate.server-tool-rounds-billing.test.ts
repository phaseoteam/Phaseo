import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timer } from "../telemetry/timer";
import type { PriceCard } from "../pricing/types";

// The whole success path runs for real (text-generate, finalizeRequest, stream settlement,
// pricing, BYOK fee); only provider calls, the wallet charge and audit persistence are faked.
const mocks = vi.hoisted(() => ({
	doRequestWithIR: vi.fn(),
	charge: vi.fn(async (_args: any) => undefined),
	byokCount: 10,
	background: [] as Promise<unknown>[],
}));

vi.mock("../execute", () => ({ doRequestWithIR: (...args: any[]) => mocks.doRequestWithIR(...args) }));
vi.mock("../after/charge", () => ({ recordUsageAndChargeOnce: (args: any) => mocks.charge(args) }));
vi.mock("../audit", () => ({ auditSuccess: vi.fn(async () => undefined), auditFailure: vi.fn(async () => undefined) }));
vi.mock("@observability/events", () => ({ emitGatewayRequestEvent: async () => undefined }));
vi.mock("@observability/otlp-export", () => ({ enqueueGatewayOtlpExport: async () => undefined }));
vi.mock("@core/provider-rate-limits", () => ({ recordManagedProviderTokensOnce: async () => undefined }));
vi.mock("../execute/health", () => ({
	classifyProviderHealthImpact: () => "success",
	onCallEnd: async () => undefined,
	reportProbeResult: async () => undefined,
	maybeOpenOnRecentErrors: async () => undefined,
}));
vi.mock("../execute/sticky-routing", () => ({
	maybeWriteStickyRoutingFromUsage: async () => undefined,
	resolveCacheAwareRoutingPreference: () => false,
}));
vi.mock("@/runtime/env", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/runtime/env")>()),
	getResponseCache: () => null,
	getBindings: () => ({}),
	getSupabaseAdmin: () => ({
		rpc: async () => ({ data: [{ month_start: "2026-11-01T00:00:00.000Z", request_count: mocks.byokCount }], error: null }),
	}),
	ensureRuntimeForBackground: () => () => {},
	dispatchBackground: (promise: Promise<unknown>) => { mocks.background.push(Promise.resolve(promise).catch(() => undefined)); },
}));

import { runTextGeneratePipeline } from "./text-generate";
import { __resetByokAllowanceCacheForTests, BYOK_MONTHLY_FREE_REQUESTS } from "../pricing/byok-fee";

const card = (provider: string, model: string, input: string, output: string): PriceCard => ({
	provider, model, endpoint: "text.generate", effective_from: null, effective_to: null, currency: "USD", version: null,
	rules: [
		{ pricing_plan: "standard", meter: "input_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: input, currency: "USD", match: [], priority: 100 },
		{ pricing_plan: "standard", meter: "output_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: output, currency: "USD", match: [], priority: 100 },
	],
});
// Three routes of the same request: GPT-5.4 nano ($1/$4), Opus ($5/$25) and Sonnet ($3/$15).
const ROUTES = {
	nano: { provider: "openai", apiModelId: "openai/gpt-5.4-nano", card: card("openai", "openai/gpt-5.4-nano", "1", "4") },
	opus: { provider: "anthropic", apiModelId: "anthropic/claude-opus-5.5", card: card("anthropic", "anthropic/claude-opus-5.5", "5", "25") },
	sonnet: { provider: "anthropic-us", apiModelId: "anthropic/claude-sonnet-5.5", card: card("anthropic-us", "anthropic/claude-sonnet-5.5", "3", "15") },
} as const;
type Route = keyof typeof ROUTES;

function round(route: Route, keySource: "gateway" | "byok", usage: { input: number; output: number }, toolCall: boolean) {
	const { provider, apiModelId } = ROUTES[route];
	return {
		result: {
			kind: "completed",
			provider,
			apiModelId,
			keySource,
			upstream: new Response(null, { status: 200 }),
			generationTimeMs: 1,
			bill: { cost_cents: 0, currency: "USD", usage: { prompt_tokens: usage.input, completion_tokens: usage.output, total_tokens: usage.input + usage.output } },
			ir: {
				id: `resp_${route}`,
				model: apiModelId,
				provider,
				choices: [{
					index: 0,
					message: toolCall
						? { role: "assistant", content: [], toolCalls: [{ id: `call_${route}`, name: "gateway_datetime", arguments: "{\"timezones\":[\"UTC\"]}" }] }
						: { role: "assistant", content: [{ type: "text", text: "It is noon." }] },
					finishReason: toolCall ? "tool_calls" : "stop",
				}],
				usage: { inputTokens: usage.input, outputTokens: usage.output, totalTokens: usage.input + usage.output },
			},
		},
	};
}

function args(stream: boolean, withTools = true) {
	const body: Record<string, unknown> = {
		model: "openai/gpt-5.4-nano",
		messages: [{ role: "user", content: "What time is it?" }],
		...(withTools ? { tools: [{ type: "gateway:datetime", parameters: { timezones: ["UTC"] } }] } : {}),
		...(stream ? { stream: true } : {}),
	};
	return {
		pre: {
			ok: true as const,
			ctx: {
				endpoint: "chat.completions", capability: "text.generate", protocol: "openai.chat.completions",
				requestId: "req_rounds", billingRequestId: "bill_rounds", workspaceId: "ws_1", keyId: "key_1",
				meta: { apiKeyId: "key_1", authMethod: "api_key" },
				rawBody: structuredClone(body), body: structuredClone(body), model: "openai/gpt-5.4-nano", requestedModel: "openai/gpt-5.4-nano",
				stream, providers: [],
				pricing: Object.fromEntries(Object.values(ROUTES).map((route) => [`${route.provider}:${route.apiModelId}`, route.card])),
				gating: { key: { ok: true }, keyLimit: { ok: true }, credit: { ok: true } },
				teamSettings: { billingMode: "wallet" },
				timer: new Timer(),
			} as any,
		},
		req: new Request("https://example.com/v1/chat/completions", { method: "POST" }),
		endpoint: "chat.completions" as const,
		timing: { timer: new Timer(), internal: { adapterMarked: false } },
	};
}

async function charged(rounds: Array<ReturnType<typeof round> | Response>, stream: boolean, withTools = true) {
	let next = 0;
	mocks.doRequestWithIR.mockImplementation(async () => rounds[next++]);
	// Settlement runs after the response (in the background for buffered requests): wait for the charge itself.
	const charge = new Promise<any>((resolve) => mocks.charge.mockImplementation(async (chargeArgs: any) => { resolve(chargeArgs); }));
	const request = args(stream, withTools);
	const response = await runTextGeneratePipeline(request);
	await response.text();
	const { costNanos } = await charge;
	await Promise.all(mocks.background.splice(0));
	expect(mocks.charge).toHaveBeenCalledOnce();
	return { costNanos: costNanos as number, ctx: request.pre.ctx, status: response.status };
}

describe.each([false, true])("successful multi-round server-tool requests (stream: %s)", (stream) => {
	beforeEach(() => {
		mocks.charge.mockClear();
		mocks.doRequestWithIR.mockReset();
		mocks.background.length = 0;
		mocks.byokCount = 10;
		__resetByokAllowanceCacheForTests();
	});

	it("prices each round on the route it ran on after a provider fallback", async () => {
		const { costNanos, ctx } = await charged([
			round("nano", "gateway", { input: 1_000, output: 100 }, true),
			round("opus", "gateway", { input: 2_000, output: 150 }, false),
		], stream);
		// Nano: 1,000 x $1/M + 100 x $4/M = $0.0014. Opus: 2,000 x $5/M + 150 x $25/M = $0.01375.
		expect(costNanos).toBe(1_400_000 + 13_750_000);
		expect(ctx.serverToolRoundsBill.pricing.lines.map((line: any) => [line.round, line.provider, line.dimension, line.line_nanos])).toEqual([
			[1, "openai", "input_text_tokens", 1_000_000],
			[1, "openai", "output_text_tokens", 400_000],
			[2, "anthropic", "input_text_tokens", 10_000_000],
			[2, "anthropic", "output_text_tokens", 3_750_000],
		]);
	});

	it("still charges a managed round when the final round ran on the customer's key", async () => {
		const { costNanos } = await charged([
			round("nano", "gateway", { input: 1_000, output: 100 }, true),
			round("opus", "byok", { input: 2_000, output: 150 }, false),
		], stream);
		// The Opus round is on the customer's key within the free BYOK allowance.
		expect(costNanos).toBe(1_400_000);
	});

	it("charges one BYOK request once the allowance runs out on the request's first BYOK round", async () => {
		// The counter reaches the 250,000th request on this request: it is the last free one,
		// for every BYOK round of it, including the one after a managed round.
		mocks.byokCount = BYOK_MONTHLY_FREE_REQUESTS;
		const { costNanos } = await charged([
			round("opus", "byok", { input: 2_000, output: 150 }, true),
			round("nano", "gateway", { input: 1_000, output: 100 }, true),
			round("sonnet", "byok", { input: 1_000, output: 100 }, false),
		], stream);
		expect(costNanos).toBe(1_400_000);
	});
});

describe("a server-tool request that fails after completed rounds, through the real error path", () => {
	beforeEach(() => {
		mocks.charge.mockClear();
		mocks.doRequestWithIR.mockReset();
		mocks.background.length = 0;
		__resetByokAllowanceCacheForTests();
	});

	it.each([false, true])("charges the completed rounds once when the follow-up's provider fallbacks all fail (stream: %s)", async (stream) => {
		const { costNanos, status } = await charged([
			round("nano", "gateway", { input: 1_000, output: 100 }, true),
			round("opus", "gateway", { input: 2_000, output: 150 }, true),
			new Response(JSON.stringify({ error: "upstream_error", failed_providers: ["anthropic", "anthropic-us"] }), { status: 502 }),
		], stream);
		if (!stream) expect(status).toBe(502);
		expect(costNanos).toBe(1_400_000 + 13_750_000);
	});
});

describe("a streamed server-tool request whose client disconnects mid-loop", () => {
	beforeEach(() => {
		mocks.charge.mockClear();
		mocks.doRequestWithIR.mockReset();
		mocks.background.length = 0;
		__resetByokAllowanceCacheForTests();
	});

	it("charges every round that completed, each on its own route, once", async () => {
		let releaseSecondRound!: () => void;
		const secondRoundHeld = new Promise<void>((resolve) => { releaseSecondRound = resolve; });
		const rounds = [
			round("nano", "gateway", { input: 1_000, output: 100 }, true),
			round("opus", "gateway", { input: 2_000, output: 150 }, true),
		];
		let next = 0;
		mocks.doRequestWithIR.mockImplementation(async () => {
			const index = next++;
			if (index === 1) await secondRoundHeld;
			return rounds[index];
		});
		const charge = new Promise<any>((resolve) => mocks.charge.mockImplementation(async (chargeArgs: any) => { resolve(chargeArgs); }));

		const response = await runTextGeneratePipeline(args(true));
		await vi.waitFor(() => expect(mocks.doRequestWithIR).toHaveBeenCalledTimes(2));
		// The client goes away while the second round is still running.
		await response.body!.cancel();
		releaseSecondRound();
		const { costNanos } = await charge;
		await Promise.all(mocks.background.splice(0));

		// No third round starts; the two completed rounds are charged on their own routes.
		expect(mocks.doRequestWithIR).toHaveBeenCalledTimes(2);
		expect(costNanos).toBe(1_400_000 + 13_750_000);
		expect(mocks.charge).toHaveBeenCalledOnce();
	});
});

describe("a single-round request is priced as before", () => {
	beforeEach(() => {
		mocks.charge.mockClear();
		mocks.doRequestWithIR.mockReset();
		mocks.background.length = 0;
		__resetByokAllowanceCacheForTests();
	});

	it.each([false, true])("charges the route's price for its own usage, with no round bill (stream: %s)", async (stream) => {
		// A stream with server tools is materialized and re-sent, the shape these mocks produce.
		const { costNanos, ctx } = await charged([round("nano", "gateway", { input: 1_000, output: 100 }, false)], stream, stream);
		expect(costNanos).toBe(1_400_000);
		expect(ctx.serverToolRoundsBill ?? null).toBeNull();
	});

	it("charges a server-tool request that needed no tool call exactly like one without tools", async () => {
		const plain = await charged([round("nano", "gateway", { input: 1_000, output: 100 }, false)], false, false);
		mocks.charge.mockClear();
		const withTools = await charged([round("nano", "gateway", { input: 1_000, output: 100 }, false)], false, true);
		expect(withTools.costNanos).toBe(plain.costNanos);
	});
});
