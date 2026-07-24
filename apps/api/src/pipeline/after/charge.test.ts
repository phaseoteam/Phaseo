import { beforeEach, describe, expect, it, vi } from "vitest";

const recordUsageAndChargeMock = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("../pricing/persist", () => ({
	recordUsageAndCharge: recordUsageAndChargeMock,
}));

import { recordUsageAndChargeOnce } from "./charge";

describe("recordUsageAndChargeOnce", () => {
	beforeEach(() => {
		recordUsageAndChargeMock.mockClear();
	});

	it("records usage charge once per request context", async () => {
		const ctx: any = {
			requestId: "req_charge",
			workspaceId: "team_charge",
			endpoint: "responses",
			meta: {},
		};

		await recordUsageAndChargeOnce({
			ctx,
			costNanos: 12345,
			endpoint: "responses",
		});
		await recordUsageAndChargeOnce({
			ctx,
			costNanos: 12345,
			endpoint: "responses",
		});

		expect(recordUsageAndChargeMock).toHaveBeenCalledTimes(1);
		expect(recordUsageAndChargeMock).toHaveBeenCalledWith({
			requestId: "req_charge",
			workspaceId: "team_charge",
			cost_nanos: 12345,
		});
	});

	it("skips non-positive charge values", async () => {
		const ctx: any = {
			requestId: "req_charge_zero",
			workspaceId: "team_charge",
			endpoint: "responses",
			meta: {},
		};

		await recordUsageAndChargeOnce({
			ctx,
			costNanos: 0,
			endpoint: "responses",
		});

		expect(recordUsageAndChargeMock).not.toHaveBeenCalled();
	});

	it("never charges an internally-authorized testing-mode request", async () => {
		const ctx: any = {
			requestId: "req_charge_synthetic",
			workspaceId: "team_perf",
			endpoint: "responses",
			testingMode: true,
			meta: {},
		};

		await recordUsageAndChargeOnce({
			ctx,
			costNanos: 999_000_000,
			endpoint: "responses",
		});

		expect(recordUsageAndChargeMock).not.toHaveBeenCalled();
	});

	it("retries an idempotent charge after a transient persistence failure", async () => {
		recordUsageAndChargeMock
			.mockRejectedValueOnce(new Error("temporary_supabase_failure"))
			.mockResolvedValueOnce(undefined);
		const ctx: any = {
			requestId: "req_charge_retry",
			workspaceId: "team_charge",
			endpoint: "responses",
			meta: {},
		};

		await recordUsageAndChargeOnce({
			ctx,
			costNanos: 54321,
			endpoint: "responses",
		});

		expect(recordUsageAndChargeMock).toHaveBeenCalledTimes(2);
		expect(ctx.meta.__usageChargeRecorded).toBe(true);
	});
});

