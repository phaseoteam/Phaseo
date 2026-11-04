import {
	buildProviderHealthChartData,
	hasProviderAttemptHealth,
	summarizeProviderHealth,
} from "./ModelProviderHealthChart";

const now = new Date("2026-08-30T10:42:00.000Z");

describe("provider health chart data", () => {
	test("uses attempt health only when the data API sends it", () => {
		expect(hasProviderAttemptHealth([{ bucket: "2026-08-30T09:00:00Z", overallSuccessPct: 100, worstProviderSuccessPct: 100, requests: 3 }])).toBe(false);
		expect(hasProviderAttemptHealth([{ bucket: "2026-08-30T09:00:00Z", overallSuccessPct: 100, worstProviderSuccessPct: 100, requests: 3, eligibleAttempts: 0 }])).toBe(true);
	});

	test("shows hours without eligible attempts as 100%", () => {
		const points = buildProviderHealthChartData([
			// Only customer-caused attempts this hour: nothing to rate.
			{ bucket: "2026-08-30T10:00:00Z", overallSuccessPct: null, worstProviderSuccessPct: null, requests: 2, eligibleAttempts: 0, reachabilityPct: null, capacityPct: null, callErrorPct: null },
		], now);
		expect(points).toHaveLength(24);
		expect(points.every((point) => point.reachability === 100 && point.capacity === 100 && point.callErrors === 100)).toBe(true);
	});

	test("places each metric and its failures in the matching hour", () => {
		const points = buildProviderHealthChartData([
			{
				bucket: "2026-08-30T09:27:00Z",
				overallSuccessPct: 100,
				worstProviderSuccessPct: 100,
				requests: 340,
				eligibleAttempts: 340,
				reachabilityFailures: 2,
				capacityFailures: 17,
				callErrorFailures: 0,
				reachabilityPct: 99.41,
				capacityPct: 95,
				callErrorPct: 100,
			},
		], now);
		expect(points.at(-2)).toMatchObject({
			time: "09:00",
			eligibleAttempts: 340,
			reachability: 99.41,
			capacity: 95,
			callErrors: 100,
			reachabilityFailures: 2,
			capacityFailures: 17,
			callErrorsFailures: 0,
		});
		const summary = summarizeProviderHealth(points);
		expect(summary.eligibleAttempts).toBe(340);
		expect(summary.reachability.failures).toBe(2);
		expect(summary.capacity.failures).toBe(17);
		// Hourly average over 24 hours, empty hours at 100%, like the request-level chart.
		expect(summary.capacity.averagePct).toBeCloseTo((23 * 100 + 95) / 24, 6);
		expect(summary.callErrors.averagePct).toBe(100);
	});
});
