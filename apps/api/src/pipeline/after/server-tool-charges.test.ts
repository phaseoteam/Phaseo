import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PriceCard } from "../pricing/types";

const recordUsageAndChargeOnceMock = vi.fn();
const byokCounterRpc = vi.fn();
vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => ({ rpc: byokCounterRpc }),
	dispatchBackground: (promise: Promise<unknown>) => { void promise.catch(() => {}); },
}));

vi.mock("./charge", () => ({
	recordUsageAndChargeOnce: (...args: any[]) => recordUsageAndChargeOnceMock(...args),
}));

// No database: a card the request context does not carry is not found.
vi.mock("../pricing", async (importOriginal) => ({
	...(await importOriginal<typeof import("../pricing")>()),
	loadPriceCard: async () => null,
}));

import { chargeCompletedServerToolRounds, priceServerToolSubCall } from "./server-tool-charges";
import { __resetByokAllowanceCacheForTests, BYOK_MONTHLY_FREE_REQUESTS } from "../pricing/byok-fee";

function card(provider: string, model: string, inputPerMillion: string, outputPerMillion: string): PriceCard {
	return {
		provider,
		model,
		endpoint: "text.generate",
		effective_from: null,
		effective_to: null,
		currency: "USD",
		version: null,
		rules: [
			{ pricing_plan: "standard", meter: "input_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: inputPerMillion, currency: "USD", match: [], priority: 100 },
			{ pricing_plan: "standard", meter: "output_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: outputPerMillion, currency: "USD", match: [], priority: 100 },
		],
	};
}

function ctx(overrides: Record<string, unknown> = {}): any {
	return {
		requestId: "req_tools",
		billingRequestId: "bill_tools",
		workspaceId: "ws_1",
		endpoint: "chat.completions",
		capability: "text.generate",
		model: "google/gemma-4-31b:free",
		body: { model: "google/gemma-4-31b:free" },
		meta: {},
		pricing: {},
		teamSettings: { billingMode: "wallet" },
		...overrides,
	};
}

function completedResult(provider: string, apiModelId: string, usage: { inputTokens: number; outputTokens: number }, keySource: "gateway" | "byok" = "gateway"): any {
	return {
		kind: "completed",
		provider,
		apiModelId,
		keySource,
		upstream: new Response(null, { status: 200 }),
		generationTimeMs: 1,
		bill: {
			cost_cents: 0,
			currency: "USD",
			usage: { prompt_tokens: usage.inputTokens, completion_tokens: usage.outputTokens, total_tokens: usage.inputTokens + usage.outputTokens },
		},
		ir: {
			id: "resp",
			model: apiModelId,
			provider,
			choices: [{ index: 0, message: { role: "assistant", content: [{ type: "text", text: "advice" }] }, finishReason: "stop" }],
			usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, totalTokens: usage.inputTokens + usage.outputTokens },
		},
	};
}

describe("priceServerToolSubCall", () => {
	it("prices an advisor call on the advisor model's own card", async () => {
		const advisorCtx = ctx({
			model: "anthropic/claude-opus-5.5",
			body: { model: "anthropic/claude-opus-5.5" },
			pricing: { "anthropic:anthropic/claude-opus-5.5": card("anthropic", "anthropic/claude-opus-5.5", "5", "25") },
		});
		const charge = await priceServerToolSubCall({
			ctx: advisorCtx,
			result: completedResult("anthropic", "anthropic/claude-opus-5.5", { inputTokens: 2_000, outputTokens: 28_000 }),
			kind: "advisor",
			model: "anthropic/claude-opus-5.5",
		});

		// 2,000 input at $5/M + 28,000 output at $25/M = $0.71.
		expect(charge).toMatchObject({ kind: "advisor", provider: "anthropic", keySource: "gateway", totalNanos: 710_000_000, inputTokens: 2_000, outputTokens: 28_000 });
	});

	it("carries no charge for a call on the workspace's own provider key", async () => {
		const charge = await priceServerToolSubCall({
			ctx: ctx({ pricing: { "anthropic:anthropic/claude-opus-5.5": card("anthropic", "anthropic/claude-opus-5.5", "5", "25") } }),
			result: completedResult("anthropic", "anthropic/claude-opus-5.5", { inputTokens: 2_000, outputTokens: 28_000 }, "byok"),
			kind: "advisor",
			model: "anthropic/claude-opus-5.5",
		});
		expect(charge.totalNanos).toBe(0);
	});

	it("fails when the executed route has no price card", async () => {
		await expect(priceServerToolSubCall({
			ctx: ctx(),
			result: completedResult("anthropic", "anthropic/claude-opus-5.5", { inputTokens: 1, outputTokens: 1 }),
			kind: "advisor",
			model: "anthropic/claude-opus-5.5",
		})).rejects.toThrow(/pricing_card_missing_for_executed_route/);
	});
});

const round = (provider: string, apiModelId: string, usage: { inputTokens: number; outputTokens: number }, keySource: "gateway" | "byok" = "gateway") => {
	const result = completedResult(provider, apiModelId, usage, keySource);
	return { result, usage: result.ir.usage };
};
const NANO = "openai:openai/gpt-5.4-nano";
const OPUS = "anthropic:anthropic/claude-opus-5.5";
const cards = {
	[NANO]: card("openai", "openai/gpt-5.4-nano", "1", "4"),
	[OPUS]: card("anthropic", "anthropic/claude-opus-5.5", "5", "25"),
};
const searches = { server_tool_web_search_requests: 2, server_tool_use: { web_search_requests: 2 } };
const failedRequest = (rounds: ReturnType<typeof round>[], overrides: Record<string, unknown> = {}) => {
	const mainCtx = ctx({ model: "openai/gpt-5.4-nano", body: { model: "openai/gpt-5.4-nano" }, pricing: cards, ...overrides });
	const total = rounds.reduce((sum, item) => ({ in: sum.in + item.usage.inputTokens, out: sum.out + item.usage.outputTokens }), { in: 0, out: 0 });
	return {
		ctx: mainCtx,
		charge: () => chargeCompletedServerToolRounds({
			ctx: mainCtx,
			protocol: "openai.chat.completions",
			rounds,
			usage: { inputTokens: total.in, outputTokens: total.out, totalTokens: total.in + total.out },
			toolMeters: searches,
		}),
	};
};
// Round A: 1,000 in / 100 out; round B: 2,000 in / 150 out.
const roundA = (provider = "openai", keySource: "gateway" | "byok" = "gateway") =>
	round(provider, provider === "openai" ? "openai/gpt-5.4-nano" : "anthropic/claude-opus-5.5", { inputTokens: 1_000, outputTokens: 100 }, keySource);
const roundB = (provider = "openai", keySource: "gateway" | "byok" = "gateway") =>
	round(provider, provider === "openai" ? "openai/gpt-5.4-nano" : "anthropic/claude-opus-5.5", { inputTokens: 2_000, outputTokens: 150 }, keySource);

describe("chargeCompletedServerToolRounds", () => {
	beforeEach(() => {
		recordUsageAndChargeOnceMock.mockReset();
		__resetByokAllowanceCacheForTests();
		byokCounterRpc.mockResolvedValue({ data: [{ month_start: "2026-11-01T00:00:00.000Z", request_count: 10 }], error: null });
	});

	it("charges completed rounds, managed searches and sub-calls before an error is returned", async () => {
		const request = failedRequest([roundA(), roundB()], {
			serverToolSubCallCharges: [
				{ kind: "advisor", model: "anthropic/claude-opus-5.5", provider: "anthropic", keySource: "gateway", totalNanos: 710_000_000, currency: "USD" },
			],
		});
		// The wallet charge succeeds.
		recordUsageAndChargeOnceMock.mockImplementation(async ({ ctx: charged }: any) => { charged.meta.__usageChargeRecorded = true; });
		const charged = await request.charge();

		// Tokens: 3,000 x $1/M + 250 x $4/M = $0.004; 2 searches x $0.007 = $0.014; advisor $0.71.
		expect(charged).toBe(4_000_000 + 14_000_000 + 710_000_000);
		expect(recordUsageAndChargeOnceMock).toHaveBeenCalledWith(expect.objectContaining({ ctx: request.ctx, costNanos: 728_000_000 }));
		expect(request.ctx.serverToolPartialCharge).toMatchObject({ costNanos: 728_000_000 });
	});

	it("prices each round on the route it ran on when the provider changed mid-loop", async () => {
		// Round A on GPT-5.4 nano ($1/$4): $0.0014. Round B fell back to Opus ($5/$25): $0.01375.
		expect(await failedRequest([roundA("openai"), roundB("anthropic")]).charge()).toBe(1_400_000 + 13_750_000 + 14_000_000);
	});

	it("does not bill a BYOK round as managed after a fallback to Phaseo's key", async () => {
		// Round A ran on the customer's key (free this month); round B on Phaseo's: $0.0026.
		expect(await failedRequest([roundA("openai", "byok"), roundB("openai")]).charge()).toBe(2_600_000 + 14_000_000);
	});

	it("still bills a managed round when the last round ran on the customer's key", async () => {
		expect(await failedRequest([roundA("openai"), roundB("openai", "byok")]).charge()).toBe(1_400_000 + 14_000_000);
	});
});

describe("chargeCompletedServerToolRounds on a BYOK request", () => {
	beforeEach(() => {
		recordUsageAndChargeOnceMock.mockReset();
		__resetByokAllowanceCacheForTests();
	});

	const failedByokRequest = () => failedRequest([roundA("openai", "byok"), roundB("openai", "byok")]).charge();

	it("charges Phaseo's searches at cost within the free allowance", async () => {
		byokCounterRpc.mockResolvedValue({ data: [{ month_start: "2026-11-01T00:00:00.000Z", request_count: 10 }], error: null });
		// Tokens ($0.004) ran on the customer's key and are free this month; 2 searches are $0.014.
		expect(await failedByokRequest()).toBe(14_000_000);
	});

	it("adds the 2.5% fee on the provider spend once the allowance is used up", async () => {
		byokCounterRpc.mockResolvedValue({ data: [{ month_start: "2026-11-01T00:00:00.000Z", request_count: BYOK_MONTHLY_FREE_REQUESTS + 1 }], error: null });
		// 2.5% of round A ($0.0014) and round B ($0.0026).
		expect(await failedByokRequest()).toBe(14_000_000 + 35_000 + 65_000);
	});
});

describe("image-tool charges in a multi-round bill", () => {
	beforeEach(() => {
		recordUsageAndChargeOnceMock.mockReset();
		__resetByokAllowanceCacheForTests();
		byokCounterRpc.mockResolvedValue({ data: [{ month_start: "2026-11-01T00:00:00.000Z", request_count: 10 }], error: null });
	});

	it("adds each image model's charge once, at full cost on Phaseo's keys and at the BYOK fee on the customer's", async () => {
		const request = failedRequest([roundA(), roundB()], {
			meta: {
				serverToolPricing: [
					{ component: "image_generation", model: "openai/gpt-image-2.6", provider: "openai", total_nanos: 40_000_000, key_source: "gateway", lines: [{ dimension: "output_image", line_nanos: 40_000_000 }] },
					{ component: "image_generation", model: "openai/gpt-image-2.6", provider: "openai", total_nanos: 40_000_000, key_source: "byok", lines: [] },
				],
			},
		});
		// Rounds $0.004 (each priced without the image charges); searches $0.014; images $0.04 + 2.5% of $0.04.
		expect(await request.charge()).toBe(4_000_000 + 14_000_000 + 40_000_000 + 1_000_000);
	});
});
