import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => ({ rpc: rpcMock }),
	dispatchBackground: (promise: Promise<unknown>) => { void promise.catch(() => {}); },
}));

import { __resetByokAllowanceCacheForTests, applyByokServiceFee, BYOK_MONTHLY_FREE_REQUESTS } from "./byok-fee";

// A BYOK request: the model ran on the customer's key (provider reference $0.04), and two
// managed searches and a fetch ran on Phaseo's keys ($0.015).
const pricedUsage = () => ({
	input_tokens: 2_000,
	output_tokens: 400,
	server_tool_web_search_requests: 2,
	server_tool_web_fetch_requests: 1,
	pricing: {
		total_nanos: 55_000_000,
		total_cents: 5,
		currency: "USD",
		lines: [
			{ dimension: "input_text_tokens", line_nanos: 30_000_000 },
			{ dimension: "output_text_tokens", line_nanos: 10_000_000 },
			{ dimension: "server_tool_web_search_requests", quantity: 2, line_nanos: 14_000_000 },
			{ dimension: "server_tool_web_fetch_requests", quantity: 1, line_nanos: 1_000_000 },
		],
	},
});

function counterAt(requestCount: number) {
	rpcMock.mockResolvedValue({ data: [{ month_start: "2026-11-01T00:00:00.000Z", request_count: requestCount }], error: null });
}

describe("BYOK fee with Phaseo-funded managed tools", () => {
	beforeEach(() => {
		__resetByokAllowanceCacheForTests();
		rpcMock.mockReset();
	});

	it("charges managed searches and fetches at cost within the free BYOK allowance", async () => {
		counterAt(10);
		const billed = await applyByokServiceFee({ workspaceId: "ws_byok", idempotencyKey: "bill_a", isByok: true, baseCostNanos: 55_000_000, pricedUsage: pricedUsage() });

		expect(billed.byokFeeNanos).toBe(0);
		expect(billed.totalNanos).toBe(15_000_000);
		expect(billed.pricedUsage.pricing.lines.map((line: any) => line.dimension)).toEqual([
			"server_tool_web_search_requests",
			"server_tool_web_fetch_requests",
		]);
		expect(billed.pricedUsage.byok_billing).toMatchObject({ provider_reference_nanos: 40_000_000, phaseo_tool_nanos: 15_000_000, charged_nanos: 15_000_000 });
	});

	it("takes the 2.5% fee on the provider spend only, then adds the tools at cost", async () => {
		counterAt(BYOK_MONTHLY_FREE_REQUESTS + 5);
		const billed = await applyByokServiceFee({ workspaceId: "ws_byok", idempotencyKey: "bill_b", isByok: true, baseCostNanos: 55_000_000, pricedUsage: pricedUsage() });

		expect(billed.byokFeeNanos).toBe(1_000_000);
		expect(billed.totalNanos).toBe(16_000_000);
		expect(billed.pricedUsage.pricing.lines.map((line: any) => line.meter ?? line.dimension)).toEqual([
			"byok_service_fee",
			"server_tool_web_search_requests",
			"server_tool_web_fetch_requests",
		]);
	});

	it("leaves a BYOK request without managed tools as before", async () => {
		counterAt(BYOK_MONTHLY_FREE_REQUESTS + 5);
		const usage = pricedUsage();
		usage.pricing.lines = usage.pricing.lines.slice(0, 2);
		usage.pricing.total_nanos = 40_000_000;
		const billed = await applyByokServiceFee({ workspaceId: "ws_byok", idempotencyKey: "bill_c", isByok: true, baseCostNanos: 40_000_000, pricedUsage: usage });

		expect(billed.totalNanos).toBe(1_000_000);
	});

	it("treats every BYOK round of one request as that one request at the allowance boundary", async () => {
		// The increment for this request makes it the 250,000th: its last free request.
		counterAt(BYOK_MONTHLY_FREE_REQUESTS);
		const roundUsage = () => ({ pricing: { total_nanos: 40_000_000, total_cents: 4, currency: "USD", lines: [{ dimension: "input_text_tokens", line_nanos: 40_000_000 }] } });
		const first = await applyByokServiceFee({ workspaceId: "ws_edge", idempotencyKey: "bill_edge", isByok: true, baseCostNanos: 40_000_000, pricedUsage: roundUsage() });
		// A managed round in between charges no BYOK fee and does not touch the counter.
		await applyByokServiceFee({ workspaceId: "ws_edge", idempotencyKey: "bill_edge", isByok: false, baseCostNanos: 10_000_000, pricedUsage: roundUsage() });
		const second = await applyByokServiceFee({ workspaceId: "ws_edge", idempotencyKey: "bill_edge", isByok: true, baseCostNanos: 40_000_000, pricedUsage: roundUsage() });

		expect([first.byokFeeNanos, second.byokFeeNanos]).toEqual([0, 0]);
		expect(rpcMock).toHaveBeenCalledOnce();
		// The next request pays the fee.
		const next = await applyByokServiceFee({ workspaceId: "ws_edge", idempotencyKey: "bill_next", isByok: true, baseCostNanos: 40_000_000, pricedUsage: roundUsage() });
		expect(next.byokFeeNanos).toBe(1_000_000);
	});
});
