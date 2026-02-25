import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const maybeSingleMock = vi.fn();
const eqSecondMock = vi.fn();
const eqFirstMock = vi.fn();
const selectMock = vi.fn();
const fromMock = vi.fn();
const getSupabaseAdminMock = vi.fn();

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

import {
	applyByokServiceFee,
	BYOK_MONTHLY_FREE_REQUESTS,
	BYOK_SERVICE_FEE_RATE,
} from "./byok-fee";

describe("applyByokServiceFee", () => {
	beforeEach(() => {
		rpcMock.mockReset();
		maybeSingleMock.mockReset();
		eqSecondMock.mockReset();
		eqFirstMock.mockReset();
		selectMock.mockReset();
		fromMock.mockReset();
		getSupabaseAdminMock.mockReset();

		eqSecondMock.mockReturnValue({ maybeSingle: maybeSingleMock });
		eqFirstMock.mockReturnValue({ eq: eqSecondMock });
		selectMock.mockReturnValue({ eq: eqFirstMock });
		fromMock.mockReturnValue({ select: selectMock });

		getSupabaseAdminMock.mockReturnValue({
			rpc: rpcMock,
			from: fromMock,
		});
	});

	it("returns original pricing for non-BYOK requests", async () => {
		const result = await applyByokServiceFee({
			teamId: "team_1",
			isByok: false,
			baseCostNanos: 1_000_000_000,
			pricedUsage: {
				input_tokens: 10,
				pricing: {
					total_nanos: 1_000_000_000,
					total_cents: 100,
					currency: "USD",
					lines: [{ dimension: "input_text_tokens", line_nanos: 1_000_000_000 }],
				},
			},
		});

		expect(rpcMock).not.toHaveBeenCalled();
		expect(result.totalNanos).toBe(1_000_000_000);
		expect(result.totalCents).toBe(100);
		expect(result.byokFeeNanos).toBe(0);
	});

	it("keeps BYOK request free while inside monthly free tier", async () => {
		rpcMock.mockResolvedValue({
			data: [{ month_start: "2026-02-01T00:00:00+00:00", request_count: BYOK_MONTHLY_FREE_REQUESTS }],
			error: null,
		});

		const result = await applyByokServiceFee({
			teamId: "team_1",
			isByok: true,
			baseCostNanos: 2_000_000_000,
			pricedUsage: {
				input_tokens: 25,
				pricing: {
					total_nanos: 2_000_000_000,
					total_cents: 200,
					currency: "USD",
					lines: [{ dimension: "input_text_tokens", line_nanos: 2_000_000_000 }],
				},
			},
		});

		expect(rpcMock).toHaveBeenCalledWith("increment_team_byok_monthly_request_count", {
			p_team_id: "team_1",
			p_now: expect.any(String),
		});
		expect(result.totalNanos).toBe(0);
		expect(result.totalCents).toBe(0);
		expect(result.byokFeeNanos).toBe(0);
		expect(result.byokMonthlyRequestCount).toBe(BYOK_MONTHLY_FREE_REQUESTS);
		expect(result.pricedUsage.pricing.byok_fee_applied).toBe(false);
		expect(result.pricedUsage.pricing.lines).toEqual([]);
	});

	it("charges 3.5% fee after free-tier threshold", async () => {
		rpcMock.mockResolvedValue({
			data: [{ month_start: "2026-02-01T00:00:00+00:00", request_count: BYOK_MONTHLY_FREE_REQUESTS + 1 }],
			error: null,
		});

		const baseCost = 2_000_000_000; // $2.00
		const expectedFeeNanos = Math.round(baseCost * BYOK_SERVICE_FEE_RATE); // $0.07

		const result = await applyByokServiceFee({
			teamId: "team_1",
			isByok: true,
			baseCostNanos: baseCost,
			pricedUsage: {
				input_tokens: 25,
				pricing: {
					total_nanos: baseCost,
					total_cents: 200,
					currency: "USD",
					lines: [{ dimension: "input_text_tokens", line_nanos: baseCost }],
				},
			},
		});

		expect(result.byokFeeNanos).toBe(expectedFeeNanos);
		expect(result.totalNanos).toBe(expectedFeeNanos);
		expect(result.totalCents).toBe(7);
		expect(result.pricedUsage.pricing.byok_fee_applied).toBe(true);
		expect(result.pricedUsage.pricing.lines).toHaveLength(1);
		expect(result.pricedUsage.pricing.lines[0].meter).toBe("byok_service_fee");
		expect(result.pricedUsage.pricing.byok_reference_total_nanos).toBe(baseCost);
	});

	it("uses fallback read when rpc increment fails", async () => {
		rpcMock.mockResolvedValue({
			data: null,
			error: { message: "rpc failed" },
		});
		maybeSingleMock.mockResolvedValue({
			data: { month_start: "2026-02-01T00:00:00+00:00", request_count: BYOK_MONTHLY_FREE_REQUESTS },
			error: null,
		});

		const result = await applyByokServiceFee({
			teamId: "team_1",
			isByok: true,
			baseCostNanos: 3_000_000_000,
			pricedUsage: {
				pricing: {
					total_nanos: 3_000_000_000,
					total_cents: 300,
					currency: "USD",
					lines: [{ dimension: "input_text_tokens", line_nanos: 3_000_000_000 }],
				},
			},
		});

		expect(result.byokMonthlyRequestCount).toBe(BYOK_MONTHLY_FREE_REQUESTS + 1);
		expect(result.totalNanos).toBe(105_000_000); // $3 * 3.5%
		expect(result.pricedUsage.byok_billing.counter_source).toBe("fallback_read");
	});

	it("charges conservatively when counter is unavailable", async () => {
		rpcMock.mockResolvedValue({
			data: null,
			error: { message: "rpc failed" },
		});
		maybeSingleMock.mockResolvedValue({
			data: null,
			error: { message: "fallback failed" },
		});

		const result = await applyByokServiceFee({
			teamId: "team_1",
			isByok: true,
			baseCostNanos: 3_000_000_000,
			pricedUsage: {
				pricing: {
					total_nanos: 3_000_000_000,
					total_cents: 300,
					currency: "USD",
					lines: [{ dimension: "input_text_tokens", line_nanos: 3_000_000_000 }],
				},
			},
		});

		expect(result.totalNanos).toBe(105_000_000);
		expect(result.totalCents).toBe(10);
		expect(result.byokMonthlyRequestCount).toBeNull();
		expect(result.pricedUsage.pricing.byok_fee_applied).toBe(true);
		expect(result.pricedUsage.byok_billing.counter_source).toBe("unavailable");
		expect(result.pricedUsage.byok_billing.counter_failure_mode).toBe("charge");
	});
});
