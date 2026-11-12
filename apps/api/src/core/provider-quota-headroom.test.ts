import { describe, expect, it } from "vitest";
import { QUOTA_HEADROOM, projectedQuotaUse, quotaHeadroomMultiplier, unusedLeaseAllowance } from "./provider-quota-headroom";

const MINUTE = 60_000;
const DAY = 86_400_000;
const minute = (used: number, previous: number | null = null, limit = 600) =>
	({ limit, used, previous, windowMs: MINUTE, windowStartMs: 0 });

describe("projected quota use", () => {
	it("projects the rest of the window at the rate so far", () => {
		// 300 of 600 by half time is on course to reach the limit.
		expect(projectedQuotaUse([minute(300)], 30_000)).toBeCloseTo(1);
		expect(projectedQuotaUse([minute(150)], 30_000)).toBeCloseTo(0.5);
		// Use already counted is never projected away.
		expect(projectedQuotaUse([minute(540)], MINUTE)).toBeCloseTo(0.9);
	});

	it("starts a window from the previous window's use and moves to its own as it elapses", () => {
		expect(projectedQuotaUse([minute(0, 480)], 0)).toBeCloseTo(0.8);
		// Half way: the previous window's 10/s and this window's 5/s weigh equally.
		expect(projectedQuotaUse([minute(150, 600)], 30_000)).toBeCloseTo((150 + 7.5 * 30) / 600);
		expect(projectedQuotaUse([minute(150, 600)], MINUTE)).toBeCloseTo(0.25);
	});

	it("does not extrapolate the first moments of a window without a previous one", () => {
		const observed = DAY * QUOTA_HEADROOM.minObservedFraction;
		// 1% of the day's limit five minutes in is measured over the first 72 minutes, not five.
		expect(projectedQuotaUse([{ limit: 10_000, used: 100, previous: null, windowMs: DAY, windowStartMs: 0 }], 5 * MINUTE))
			.toBeCloseTo((100 + (100 / observed) * (DAY - 5 * MINUTE)) / 10_000);
	});

	it("reports the worst limited window and ignores unlimited ones", () => {
		expect(projectedQuotaUse([
			{ ...minute(1_000_000), limit: null },
			minute(300),
			minute(450, null, 1_000),
		], 30_000)).toBeCloseTo(1);
		expect(projectedQuotaUse([], 0)).toBe(0);
	});
});

describe("unused lease allowance", () => {
	it("is what a lease has not been reported to use", () => {
		expect(unusedLeaseAllowance({ granted: 20, reported: 1 })).toBe(19);
		expect(unusedLeaseAllowance({ granted: 20, reported: 25 })).toBe(0);
	});
});

describe("quota headroom multiplier", () => {
	it("leaves scores alone until the penalty starts and reaches the floor at the limit", () => {
		expect(quotaHeadroomMultiplier(0)).toBe(1);
		expect(quotaHeadroomMultiplier(QUOTA_HEADROOM.penaltyStart)).toBe(1);
		expect(quotaHeadroomMultiplier(1)).toBeCloseTo(QUOTA_HEADROOM.penaltyFloor);
		expect(quotaHeadroomMultiplier(3)).toBeCloseTo(QUOTA_HEADROOM.penaltyFloor);
		expect(quotaHeadroomMultiplier(Number.NaN)).toBe(1);
	});

	it("eases in, falling faster as the projection nears the limit", () => {
		const points = Array.from({ length: 26 }, (_, index) => quotaHeadroomMultiplier(0.75 + index / 100));
		for (let index = 1; index < points.length; index += 1) expect(points[index]).toBeLessThan(points[index - 1]);
		const midpoint = quotaHeadroomMultiplier(QUOTA_HEADROOM.penaltyStart + (1 - QUOTA_HEADROOM.penaltyStart) / 2);
		expect(midpoint).toBeCloseTo(1 - (1 - QUOTA_HEADROOM.penaltyFloor) / 4);
	});
});
