import { describe, expect, it } from "vitest";
import {
	type AttemptHealthCounts,
	attemptHealthByHour,
	attemptHealthOverHours,
	attemptHealthRates,
	type ProviderAttemptHealth,
} from "@/routes/public/providerAttemptHealth";

const counts = (overrides: Partial<AttemptHealthCounts>): AttemptHealthCounts => ({
	attempts: 0,
	eligibleAttempts: 0,
	successAttempts: 0,
	reachabilityFailures: 0,
	capacityFailures: 0,
	callErrorFailures: 0,
	...overrides,
});

function row(buckets: Array<{ start: string } & Partial<AttemptHealthCounts>>): ProviderAttemptHealth {
	const parsed = buckets.map(({ start, ...rest }) => {
		const bucketCounts = counts(rest);
		return {
			...bucketCounts,
			...attemptHealthRates(bucketCounts),
			start,
			end: new Date(Date.parse(start) + 3_600_000).toISOString(),
		};
	});
	return {
		...counts({}),
		...attemptHealthRates(counts({})),
		providerId: "fixture",
		serviceTier: "standard",
		providerName: "Fixture",
		buckets: parsed,
	};
}

describe("published attempt health rates", () => {
	it("never rounds a failure up to 100%", () => {
		// 1 failure in 25,000 attempts is 99.996%, which rounds to 100.00.
		const rates = attemptHealthRates(counts({
			attempts: 25_000, eligibleAttempts: 25_000, successAttempts: 24_999, reachabilityFailures: 1,
		}));
		expect(rates.reachabilityPct).toBe(99.99);
		expect(rates.uptimePct).toBe(99.99);
		// With no failures the rates are exactly 100.
		expect(rates.capacityPct).toBe(100);
		expect(rates.callErrorPct).toBe(100);
	});

	it("rates a set of hours from all their attempts, not an average of hourly rates", () => {
		// All attempts were in one hour and none reached the provider; the other hour was idle.
		const byHour = attemptHealthByHour([row([
			{ start: "2026-11-04T09:00:00.000Z", attempts: 4, eligibleAttempts: 4, reachabilityFailures: 4 },
		])]);
		const rates = attemptHealthOverHours(byHour, ["2026-11-04T08:00:00.000Z", "2026-11-04T09:00:00.000Z"]);
		expect(rates).toEqual({ reachabilityPct: 0, capacityPct: null, callErrorPct: null, uptimePct: 0 });
	});

	it("weights hours by their attempts and publishes rates only", () => {
		const byHour = attemptHealthByHour([row([
			{ start: "2026-11-04T08:00:00.000Z", attempts: 90, eligibleAttempts: 90, successAttempts: 90 },
			{ start: "2026-11-04T09:00:00.000Z", attempts: 10, eligibleAttempts: 10, successAttempts: 5, capacityFailures: 5 },
		])]);
		const rates = attemptHealthOverHours(byHour, ["2026-11-04T08:00:00.000Z", "2026-11-04T09:00:00.000Z"]);
		expect(rates).toEqual({ reachabilityPct: 100, capacityPct: 95, callErrorPct: 100, uptimePct: 95 });
		expect(Object.keys(rates).sort()).toEqual(["callErrorPct", "capacityPct", "reachabilityPct", "uptimePct"]);
	});
});
