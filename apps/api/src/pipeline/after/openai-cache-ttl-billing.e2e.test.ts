// End-to-end billing for OpenAI's 30-minute and 12-hour prompt-cache writes (GPT-5.6 and later,
// Responses API). OpenAI reports the split as input_tokens_details.cache_write_tokens_details
// { ttl_30m_tokens, ttl_12h_tokens } and prices a 30-minute write at 1.25x input, a 12-hour
// write at 2.5x input and a read at 0.1x; write rates replace the ordinary input rate
// (https://developers.openai.com/api/docs/guides/prompt-caching).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	charge: vi.fn(),
	auditSuccess: vi.fn(),
	auditFailure: vi.fn(),
	background: [] as Promise<unknown>[],
}));

vi.mock("../audit", () => ({ auditSuccess: mocks.auditSuccess, auditFailure: mocks.auditFailure }));
vi.mock("./charge", () => ({ recordUsageAndChargeOnce: mocks.charge }));
vi.mock("./guards", () => ({ guardUpstreamStatus: async () => ({ ok: true }) }));
vi.mock("@observability/events", () => ({ emitGatewayRequestEvent: vi.fn() }));
vi.mock("@core/provider-rate-limits", () => ({ recordManagedProviderTokensOnce: vi.fn() }));
vi.mock("../execute/health", () => ({
	classifyProviderHealthImpact: () => "success",
	onCallEnd: vi.fn(async () => undefined),
	reportProbeResult: vi.fn(),
	maybeOpenOnRecentErrors: vi.fn(),
}));
vi.mock("../execute/sticky-routing", () => ({
	maybeWriteStickyRoutingFromUsage: vi.fn(),
	resolveCacheAwareRoutingPreference: () => false,
}));
vi.mock("../pricing/byok-fee", () => ({
	applyByokServiceFee: async ({ baseCostNanos, pricedUsage, currencyHint }: any) => ({
		totalCents: Math.ceil(baseCostNanos / 1e7),
		totalNanos: baseCostNanos,
		currency: currencyHint,
		pricedUsage,
	}),
}));
vi.mock("@/plugins/registry", () => ({
	applyResponsePlugins: ({ payload }: any) => ({ payload, executions: [] }),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({}) }));
vi.mock("@/runtime/env", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/runtime/env")>();
	return {
		...actual,
		ensureRuntimeForBackground: () => () => {},
		dispatchBackground: (promise: Promise<unknown>) => { mocks.background.push(promise); },
		getResponseCache: () => null,
	};
});

import { finalizeRequest } from "./index";
import { handleStreamResponse } from "./stream";
import { encodeProtocol } from "@protocols/index";
import { bufferStreamToIR, resolveStreamForProtocol } from "@executors/_shared/text-generate/openai-compat";
import { normalizeTextUsageForPricing } from "@executors/_shared/usage/text";
import { computeBillSummary } from "../pricing/engine";
import { setupTestRuntime, teardownTestRuntime } from "../../../tests/helpers/runtime";
import { expectedNanos, sse, textCard } from "./__tests__/cache-billing-harness";
import type { PriceCard } from "../pricing/types";

type Endpoint = "chat.completions" | "responses" | "messages";

const PROTOCOL: Record<Endpoint, string> = {
	"chat.completions": "openai.chat.completions",
	responses: "openai.responses",
	messages: "anthropic.messages",
};

const MODEL = "openai/gpt-5.6-sol";

// GPT-5.6 Sol per 1M tokens: input $5, output $30, read 0.1x, 30-minute write 1.25x, 12-hour write 2.5x.
const INPUT = 5;
const OUTPUT = 30;
const READ = 0.5;
const WRITE_30M = 6.25;
const WRITE_12H = 12.5;

/** An OpenAI card with the generic write row and, optionally, the per-TTL rows. */
function openAICard(rows: { write30m?: boolean; write12h?: boolean; generic?: boolean } = {}): PriceCard {
	const card = textCard("openai", MODEL, {
		input: String(INPUT),
		output: String(OUTPUT),
		cachedRead: String(READ),
		...(rows.generic === false ? {} : { cachedWrite: String(WRITE_30M) }),
	});
	const extra = (meter: string, price: number) => ({ ...card.rules[0], id: `${meter}_rule`, meter, price_per_unit: String(price) });
	return {
		...card,
		rules: [
			...card.rules,
			...(rows.write30m ? [extra("cached_write_text_tokens_30m", WRITE_30M)] : []),
			...(rows.write12h ? [extra("cached_write_text_tokens_12h", WRITE_12H)] : []),
		],
	} as PriceCard;
}

// 2,100 uncached + 48,000 read + 1,000 written for 30 minutes + 2,000 written for 12 hours.
const splitUsage = {
	input_tokens: 53_100,
	output_tokens: 850,
	total_tokens: 53_950,
	input_tokens_details: {
		cached_tokens: 48_000,
		cache_write_tokens: 3_000,
		cache_write_tokens_details: { ttl_30m_tokens: 1_000, ttl_12h_tokens: 2_000 },
	},
	output_tokens_details: { reasoning_tokens: 0 },
};

const EXPECTED_SPLIT = expectedNanos([[2_100, INPUT], [48_000, READ], [1_000, WRITE_30M], [2_000, WRITE_12H], [850, OUTPUT]]);

async function settle() {
	for (let i = 0; i < 6; i++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		const pending = mocks.background.splice(0);
		await Promise.all(pending);
	}
}

function charged(): number {
	expect(mocks.auditFailure).not.toHaveBeenCalled();
	expect(mocks.charge).toHaveBeenCalledTimes(1);
	return mocks.charge.mock.calls[0][0].costNanos;
}

function ctxFor(endpoint: Endpoint, stream: boolean, card: PriceCard): any {
	return {
		requestId: "req_cache_ttl",
		billingRequestId: "bill_cache_ttl",
		workspaceId: "ws_cache_ttl",
		endpoint,
		protocol: PROTOCOL[endpoint],
		capability: "text.generate",
		model: MODEL,
		requestedModel: MODEL,
		stream,
		body: { model: MODEL, stream },
		rawBody: { model: MODEL, stream },
		meta: { requestId: "req_cache_ttl", startedAtMs: Date.now() - 50, upstreamStartMs: Date.now() - 40 },
		providers: [],
		pricing: { openai: card },
		timer: { span: (_name: string, fn: () => unknown) => fn(), mark: () => {}, end: () => {} },
	};
}

function executorArgs(endpoint: Endpoint, stream: boolean): any {
	return {
		ir: { model: "gpt-5.6-sol", stream, messages: [{ role: "user", content: [{ type: "text", text: "Continue the task." }] }] },
		requestId: "req_cache_ttl",
		workspaceId: "ws_cache_ttl",
		providerId: "openai",
		endpoint,
		protocol: PROTOCOL[endpoint],
		capability: "text.generate",
		providerModelSlug: "gpt-5.6-sol",
		capabilityParams: null,
		byokMeta: [{ id: "byok_1", key: "test-key" }],
		pricingCard: null,
		meta: {},
	};
}

function responsesSse(usage: Record<string, unknown>): Response {
	const response = {
		id: "resp_cache_ttl", object: "response", created_at: 1_760_000_000, status: "completed", model: "gpt-5.6-sol",
		output: [{ type: "message", id: "msg_1", status: "completed", role: "assistant", content: [{ type: "output_text", text: "Edited the file.", annotations: [] }] }],
		usage,
	};
	return sse([
		{ event: "response.created", data: { type: "response.created", response: { ...response, status: "in_progress", output: [], usage: null } } },
		{ event: "response.output_text.delta", data: { type: "response.output_text.delta", item_id: "msg_1", output_index: 0, delta: "Edited the file." } },
		{ event: "response.completed", data: { type: "response.completed", response } },
	]);
}

async function runBuffered(endpoint: Endpoint, card: PriceCard, usage: Record<string, unknown>) {
	const buffered = await bufferStreamToIR(responsesSse(usage), executorArgs(endpoint, false), "responses", Date.now());
	const ctx = ctxFor(endpoint, false, card);
	const result: any = {
		kind: "completed",
		provider: "openai",
		pricingKey: "openai",
		apiModelId: null,
		upstream: new Response(null, { status: 200 }),
		ir: buffered.ir,
		rawResponse: buffered.rawResponse,
		normalized: encodeProtocol(ctx.protocol, buffered.ir, ctx.requestId),
		bill: { cost_cents: 0, currency: "USD", usage: normalizeTextUsageForPricing(buffered.ir?.usage ?? buffered.usage) },
	};
	const response = await finalizeRequest({ pre: { ok: true, ctx }, exec: { ok: true, result }, endpoint: endpoint as any });
	const body = await response.json();
	await settle();
	return { nanos: charged(), usage: body.usage };
}

async function runStreamed(endpoint: Endpoint, card: PriceCard, usage: Record<string, unknown>) {
	const stream = resolveStreamForProtocol(responsesSse(usage), executorArgs(endpoint, true), "responses");
	const ctx = ctxFor(endpoint, true, card);
	const result: any = {
		kind: "stream",
		provider: "openai",
		pricingKey: "openai",
		upstream: new Response(null, { status: 200 }),
		stream,
		usageFinalizer: async () => null,
		bill: { cost_cents: 0, currency: "USD", usage: undefined, finish_reason: null },
	};
	const response = await handleStreamResponse(ctx, result, card);
	const text = await response.text();
	await settle();
	const last = text
		.split("\n")
		.filter((line) => line.startsWith("data: ") && line.includes("\"usage\""))
		.map((line) => JSON.parse(line.slice(6)))
		.at(-1);
	const nanos = charged();
	const clientUsage = last?.usage ?? last?.response?.usage ?? null;
	if (endpoint !== "messages") expect(clientUsage?.cost).toBe(nanos / 1e9);
	return { nanos, usage: clientUsage };
}

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());

beforeEach(() => {
	mocks.charge.mockReset().mockResolvedValue(undefined);
	mocks.auditSuccess.mockReset().mockResolvedValue(undefined);
	mocks.auditFailure.mockReset().mockResolvedValue(undefined);
	mocks.background.length = 0;
});

/** Chat and Messages document no per-lifetime write field, and internal meters never reach clients. */
function expectNoUndocumentedWriteFields(endpoint: Endpoint, usage: any) {
	expect(Object.keys(usage).filter((key) => key.startsWith("cached_write_text_tokens"))).toEqual([]);
	if (endpoint === "chat.completions") {
		expect(usage.prompt_tokens_details).toMatchObject({ cached_tokens: 48_000, cache_write_tokens: 3_000 });
		expect(usage.prompt_tokens_details.cache_write_tokens_details).toBeUndefined();
	}
	if (endpoint === "messages") {
		expect(usage).toMatchObject({ input_tokens: 2_100, cache_read_input_tokens: 48_000, cache_creation_input_tokens: 3_000 });
		expect(usage.input_tokens_details).toBeUndefined();
	}
}

describe("OpenAI 30-minute and 12-hour cache writes", () => {
	const card = openAICard({ write30m: true, write12h: true });

	for (const endpoint of ["chat.completions", "responses", "messages"] as const) {
		it(`bills 12-hour writes at 2.5x and 30-minute writes at 1.25x on ${endpoint} (buffered)`, async () => {
			const { nanos, usage } = await runBuffered(endpoint, card, splitUsage);
			expect(nanos).toBe(EXPECTED_SPLIT);
			expect(usage.cost).toBe(EXPECTED_SPLIT / 1e9);
			if (endpoint === "responses") {
				expect(usage.input_tokens).toBe(53_100);
				expect(usage.input_tokens_details).toMatchObject({
					cached_tokens: 48_000,
					cache_write_tokens: 3_000,
					cache_write_tokens_details: { ttl_30m_tokens: 1_000, ttl_12h_tokens: 2_000 },
				});
			}
			expectNoUndocumentedWriteFields(endpoint, usage);
		});

		it(`bills 12-hour writes at 2.5x and 30-minute writes at 1.25x on ${endpoint} (streamed)`, async () => {
			const { nanos, usage } = await runStreamed(endpoint, card, splitUsage);
			expect(nanos).toBe(EXPECTED_SPLIT);
			if (endpoint === "responses") {
				expect(usage.input_tokens_details).toMatchObject({
					cache_write_tokens: 3_000,
					cache_write_tokens_details: { ttl_30m_tokens: 1_000, ttl_12h_tokens: 2_000 },
				});
			}
			expectNoUndocumentedWriteFields(endpoint, usage);
		});
	}

	it("reports the charge as usage.cost with cost_details on Responses and Chat", async () => {
		for (const endpoint of ["responses", "chat.completions"] as const) {
			mocks.charge.mockClear();
			const { nanos, usage } = await runBuffered(endpoint, card, splitUsage);
			expect(usage.cost).toBe(nanos / 1e9);
			expect(usage.cost_details).toEqual({ upstream_inference_cost: null });
		}
	});
});

describe("OpenAI cache write split on cards without per-TTL rows", () => {
	it("prices 30-minute writes on the generic write row when the card has no 30-minute row", async () => {
		const card = openAICard({ write12h: true });
		const { nanos } = await runBuffered("responses", card, splitUsage);
		expect(nanos).toBe(EXPECTED_SPLIT);
	});

	it("never prices 12-hour writes below 2.5x input when the card has no 12-hour row", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const card = openAICard();
		const { nanos } = await runStreamed("responses", card, splitUsage);
		warn.mockRestore();
		// 12-hour writes fall back to the input rate times OpenAI's documented 2.5x.
		expect(nanos).toBe(EXPECTED_SPLIT);
	});

	it("keeps billing a write total without a split on the generic write row", async () => {
		const card = openAICard({ write30m: true, write12h: true });
		const { cache_write_tokens_details: _details, ...details } = splitUsage.input_tokens_details;
		const { nanos, usage } = await runBuffered("responses", card, { ...splitUsage, input_tokens_details: details });
		expect(nanos).toBe(expectedNanos([[2_100, INPUT], [48_000, READ], [3_000, WRITE_30M], [850, OUTPUT]]));
		expect(usage.input_tokens_details.cache_write_tokens_details).toBeUndefined();
	});
});

describe("computeBillSummary with OpenAI per-TTL write meters", () => {
	const usage = {
		input_tokens: 53_100,
		output_tokens: 850,
		input_tokens_details: splitUsage.input_tokens_details,
	};

	it("prices each TTL on its own row and takes writes out of ordinary input", () => {
		const summary = computeBillSummary(usage, openAICard({ write30m: true, write12h: true }));
		const quantities = Object.fromEntries(summary.lines.map((line) => [line.dimension, line.quantity]));
		expect(quantities).toEqual({
			input_text_tokens: 2_100,
			cached_read_text_tokens: 48_000,
			cached_write_text_tokens_30m: 1_000,
			cached_write_text_tokens_12h: 2_000,
			output_text_tokens: 850,
		});
		expect(Math.round(summary.cost_usd * 1e9)).toBe(EXPECTED_SPLIT);
	});

	it("uses the generic row for 30-minute writes and the 2.5x input fallback for 12-hour writes on a bare card", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const summary = computeBillSummary(usage, openAICard());
		warn.mockRestore();
		const quantities = Object.fromEntries(summary.lines.map((line) => [line.dimension, line.quantity]));
		expect(quantities).toMatchObject({ cached_write_text_tokens: 1_000, cached_write_text_tokens_12h: 2_000 });
		expect(summary.cache_pricing_fallback).toEqual([
			expect.objectContaining({ meter: "cached_write_text_tokens_12h", multiplier: 2.5 }),
		]);
		expect(Math.round(summary.cost_usd * 1e9)).toBe(EXPECTED_SPLIT);
	});

	it("prices 12-hour writes at 2.5x input on a third-party card whose generic write row is cheaper", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const card = { ...openAICard(), provider: "venice" } as PriceCard;
		card.rules = card.rules.map((rule) => rule.meter === "cached_write_text_tokens" ? { ...rule, price_per_unit: "2.5" } : rule);
		const summary = computeBillSummary(usage, card);
		warn.mockRestore();
		expect(Math.round(summary.cost_usd * 1e9)).toBe(
			expectedNanos([[2_100, INPUT], [48_000, READ], [1_000, 2.5], [2_000, WRITE_12H], [850, OUTPUT]]),
		);
	});
});
