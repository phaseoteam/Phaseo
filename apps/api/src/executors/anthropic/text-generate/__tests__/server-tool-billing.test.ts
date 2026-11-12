// Purpose: Claude web searches reach pricing as native_web_search_requests on every path.
// Why: usage.server_tool_use.web_search_requests was dropped from IR usage (buffered) and by
//      after-stage usage shaping (streams), so Claude web searches were never billed (AUDIT N21).
// How: Build usage the way each path does, shape it as the after stage does, and price it.

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/runtime/env", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/runtime/env")>();
	return { ...actual, getBindings: () => ({}) as any };
});

import { anthropicMessagesToIR, anthropicUsageForPricing, executeAnthropic } from "../index";
import { normalizeTextUsageForPricing } from "@executors/_shared/usage/text";
import { ANTHROPIC_CACHE_USAGE_SEMANTICS } from "../stream-transformer";
import { shapeUsageForClient } from "@pipeline/usage";
import { calculatePricing } from "@pipeline/after/pricing";
import type { PriceCard } from "@pipeline/pricing/types";

const CARD: PriceCard = {
	provider: "anthropic",
	model: "anthropic/claude-sonnet-4.5",
	endpoint: "text.generate",
	effective_from: null,
	effective_to: null,
	currency: "USD",
	version: null,
	rules: [
		{ pricing_plan: "standard", meter: "input_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "3", currency: "USD", match: [], priority: 100 },
		{ pricing_plan: "standard", meter: "output_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "15", currency: "USD", match: [], priority: 100 },
	],
};

const RAW_USAGE = { input_tokens: 1_000, output_tokens: 200, server_tool_use: { web_search_requests: 2, web_fetch_requests: 1 } };

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const STREAM = [
	sse("message_start", { type: "message_start", message: { id: "msg_1", model: "claude-x", stop_reason: null, usage: { input_tokens: 1_000, output_tokens: 1 } } }),
	sse("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
	sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Paris" } }),
	sse("content_block_stop", { type: "content_block_stop", index: 0 }),
	sse("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 200, server_tool_use: { web_search_requests: 2 } } }),
	sse("message_stop", { type: "message_stop" }),
].join("");

function webSearchNanos(usage: Record<string, unknown>): number | undefined {
	const priced = calculatePricing({ ...usage, ...shapeUsageForClient(usage, { endpoint: "messages", includeInternalHints: true }) }, CARD, {});
	return priced.pricedUsage.pricing.lines.find((line: any) => line.dimension === "native_web_search_requests")?.line_nanos;
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("Claude server tool billing", () => {
	it("keeps server_tool_use in buffered IR usage, so the bill counts the searches", () => {
		const ir = anthropicMessagesToIR({ id: "msg_1", content: [{ type: "text", text: "Paris" }], usage: RAW_USAGE }, "req_1", "claude-x", "anthropic");
		expect(ir.usage?._ext?.serverToolUse).toEqual({ web_search_requests: 2, web_fetch_requests: 1 });
		const meters = normalizeTextUsageForPricing(ir.usage, ANTHROPIC_CACHE_USAGE_SEMANTICS)!;
		expect(meters.native_web_search_requests).toBe(2);
		// The anthropic card has no search row; the documented $10 per 1,000 searches applies.
		expect(webSearchNanos(meters)).toBe(20_000_000);
	});

	it("keeps the searches through after-stage shaping on streamed usage", () => {
		// The flat meter alone does not survive shapeUsageForClient (the stream finalizer path).
		const flat = normalizeTextUsageForPricing(RAW_USAGE, ANTHROPIC_CACHE_USAGE_SEMANTICS)!;
		expect(shapeUsageForClient(flat, { endpoint: "messages" })).not.toHaveProperty("native_web_search_requests");
		const meters = anthropicUsageForPricing(RAW_USAGE)!;
		expect(meters.server_tool_use).toEqual({ web_search_requests: 2, web_fetch_requests: 1 });
		const shaped = shapeUsageForClient(meters, { endpoint: "messages" });
		expect(calculatePricing(shaped, CARD, {}).pricedUsage.pricing.lines)
			.toEqual(expect.arrayContaining([expect.objectContaining({ dimension: "native_web_search_requests", quantity: 2, line_nanos: 20_000_000 })]));
	});

	it("leaves usage without server tools unchanged", () => {
		const usage = { input_tokens: 10, output_tokens: 5 };
		expect(anthropicUsageForPricing(usage)).toEqual(normalizeTextUsageForPricing(usage, ANTHROPIC_CACHE_USAGE_SEMANTICS));
		expect(anthropicMessagesToIR({ id: "m", content: [], usage }, "r", "m", "anthropic").usage?._ext).toBeUndefined();
	});

	it("finalizes streamed usage with the search count", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(STREAM, {
			status: 200,
			headers: { "content-type": "text/event-stream", "request-id": "up_1" },
		})));
		const result: any = await executeAnthropic({
			ir: { messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }], model: "claude-x", stream: true },
			requestId: "req_ws",
			workspaceId: "team",
			providerId: "anthropic",
			providerModelSlug: "claude-x",
			capability: "text.generate",
			byokMeta: [{ id: "byok_1", key: "sk-test" }],
			pricingCard: null,
			meta: {},
			protocol: "openai.chat.completions",
			endpoint: "chat.completions",
		} as any);
		await new Response(result.stream).text();
		const bill = await result.usageFinalizer();
		expect(bill.usage).toMatchObject({ native_web_search_requests: 2, server_tool_use: { web_search_requests: 2 } });
		expect(webSearchNanos(bill.usage)).toBe(20_000_000);
	});
});
