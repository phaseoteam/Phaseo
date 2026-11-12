import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PriceCard } from "../pricing/types";

const chargeMock = vi.fn(async (_args: any) => undefined);
const byokCounterRpc = vi.fn();

vi.mock("../audit", () => ({
	auditSuccess: vi.fn(async () => undefined),
	auditFailure: vi.fn(async () => undefined),
}));
vi.mock("@observability/events", () => ({ emitGatewayRequestEvent: vi.fn(async () => undefined) }));
vi.mock("./charge", () => ({ recordUsageAndChargeOnce: (args: any) => chargeMock(args) }));
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
vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => ({ rpc: byokCounterRpc }),
	ensureRuntimeForBackground: () => () => {},
	dispatchBackground: (promise: Promise<unknown>) => { void promise.catch(() => {}); },
}));

import { handleStreamResponse } from "./stream";
import { attachServerToolUsageToRawUsage } from "../surfaces/server-tools";
import { __resetByokAllowanceCacheForTests, BYOK_MONTHLY_FREE_REQUESTS } from "../pricing/byok-fee";

// A free text card with no rows for any server-tool meter, as in production.
const freeCard = (provider: string): PriceCard => ({
	provider,
	model: "google/gemma-4-31b",
	endpoint: "text.generate",
	effective_from: null,
	effective_to: null,
	currency: "USD",
	version: null,
	rules: [
		{ pricing_plan: "standard", meter: "input_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "0", currency: "USD", match: [], priority: 100 },
		{ pricing_plan: "standard", meter: "output_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "0", currency: "USD", match: [], priority: 100 },
	],
});

const metrics = (overrides: Record<string, number>) => ({
	datetimeRequests: 0, webSearchRequests: 0, webSearchResults: 0, webSearchExtraResults: 0, webFetchRequests: 0,
	advisorRequests: 0, imageGenerationRequests: 0, applyPatchRequests: 0, subagentRequests: 0, fusionRequests: 0,
	searchModelsRequests: 0, ...overrides,
});

// The synthetic stream a server-tool request sends: the re-encoded IR, whose usage has only
// the server_tool_use counts, never the loop's flat billing meters.
function syntheticChatStream(serverToolUse: Record<string, number>): Response {
	const frames = [
		{ id: "chatcmpl_tools", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "Answer" }, finish_reason: null }] },
		{ id: "chatcmpl_tools", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
		{ id: "chatcmpl_tools", object: "chat.completion.chunk", choices: [], usage: { prompt_tokens: 40, completion_tokens: 8, total_tokens: 48, server_tool_use: serverToolUse } },
	];
	return new Response(frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("") + "data: [DONE]\n\n", {
		status: 200,
		headers: { "Content-Type": "text/event-stream" },
	});
}

async function settleStream(provider: string, toolMetrics: ReturnType<typeof metrics>, serverToolUse: Record<string, number>, keySource?: "byok", card = freeCard(provider)) {
	const upstream = syntheticChatStream(serverToolUse);
	const response = await handleStreamResponse({
		requestId: "req_tools_stream",
		billingRequestId: "bill_tools_stream",
		workspaceId: "ws_1",
		endpoint: "chat.completions",
		protocol: "openai.chat.completions",
		capability: "text.generate",
		model: "google/gemma-4-31b",
		requestedModel: "google/gemma-4-31b",
		stream: true,
		body: { model: "google/gemma-4-31b", stream: true },
		rawBody: { model: "google/gemma-4-31b", stream: true },
		meta: { requestId: "req_tools_stream", apiKeyId: "key_1", authMethod: "api_key" },
		providers: [],
		pricing: {},
		gating: { key: { ok: true }, keyLimit: { ok: true }, credit: { ok: true } },
	} as any, {
		kind: "stream",
		stream: upstream.body,
		upstream,
		provider,
		keySource,
		// text-generate puts the loop's meters on the bill before finalizing.
		bill: { cost_cents: 0, currency: "USD", usage: attachServerToolUsageToRawUsage({}, toolMetrics), finish_reason: null },
		mappedRequest: null,
		rawResponse: null,
	} as any, card);
	await response.text();
	await vi.waitFor(() => expect(chargeMock).toHaveBeenCalled());
	return chargeMock.mock.calls.at(-1)![0].costNanos as number;
}

describe("managed server-tool meters on a BYOK stream", () => {
	// $1 per million tokens on the customer's own key: 48 tokens is a $0.000048 provider reference.
	const byokCard = (): PriceCard => {
		const card = freeCard("openai");
		for (const rule of card.rules) rule.price_per_unit = "1";
		return card;
	};
	const searches = metrics({ webSearchRequests: 2, webSearchResults: 10, webFetchRequests: 1 });
	const searchUse = { web_search_requests: 2, web_search_results: 10, web_fetch_requests: 1 };
	beforeEach(() => {
		chargeMock.mockClear();
		__resetByokAllowanceCacheForTests();
	});

	it("charges Phaseo's search and fetch costs within the free BYOK allowance", async () => {
		byokCounterRpc.mockResolvedValue({ data: [{ month_start: "2026-11-01T00:00:00.000Z", request_count: 10 }], error: null });
		expect(await settleStream("openai", searches, searchUse, "byok", byokCard())).toBe(15_000_000);
	});

	it("adds them to the 2.5% fee once the allowance is used up", async () => {
		byokCounterRpc.mockResolvedValue({ data: [{ month_start: "2026-11-01T00:00:00.000Z", request_count: BYOK_MONTHLY_FREE_REQUESTS + 1 }], error: null });
		// Fee: 2.5% of 48,000 nanos = 1,200.
		expect(await settleStream("openai", searches, searchUse, "byok", byokCard())).toBe(15_001_200);
	});
});

describe("managed server-tool meters on a streamed response", () => {
	beforeEach(() => chargeMock.mockClear());

	it.each(["google-ai-studio", "openai"])("bills paid searches, extra results and fetches at Phaseo's rates (%s)", async (provider) => {
		const cost = await settleStream(
			provider,
			metrics({ webSearchRequests: 2, webSearchResults: 23, webSearchExtraResults: 3, webFetchRequests: 1 }),
			{ web_search_requests: 2, web_search_results: 23, web_search_extra_results: 3, web_fetch_requests: 1 },
		);
		// 2 searches x $0.007 + 3 extra results x $0.001 + 1 fetch x $0.001, on a free model.
		expect(cost).toBe(18_000_000);
	});

	it("keeps a TinyFish search free, not priced as a provider-native search", async () => {
		chargeMock.mockClear();
		await settleStream(
			"openai",
			metrics({ webSearchRequests: 1, webSearchResults: 5, billableWebSearchRequests: 0 }),
			{ web_search_requests: 1, web_search_results: 5 },
		);
		expect(chargeMock.mock.calls.map(([args]) => args.costNanos).filter((nanos) => nanos > 0)).toEqual([]);
	});

	it("keeps a direct fetch free", async () => {
		await settleStream(
			"openai",
			metrics({ webFetchRequests: 1, billableWebFetchRequests: 0 }),
			{ web_fetch_requests: 1 },
		);
		expect(chargeMock.mock.calls.map(([args]) => args.costNanos).filter((nanos) => nanos > 0)).toEqual([]);
	});
});
