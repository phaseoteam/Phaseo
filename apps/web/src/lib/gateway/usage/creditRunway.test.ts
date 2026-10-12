import { projectCreditRunway } from "./creditRunway";

const NOW = Date.parse("2026-10-12T00:00:00Z");
const usd = (value: number) => value * 1_000_000_000;
const base = { observedAt: NOW, autoTopUpEnabled: false, autoTopUpThresholdNanos: 0 };

describe("projectCreditRunway", () => {
	test("dates when credits run out at the recent pace", () => {
		expect(projectCreditRunway({ ...base, balanceNanos: usd(412.8), dailyNanos: usd(90) })).toEqual({
			kind: "runs_out",
			at: NOW + Math.round((412.8 / 90) * 86_400_000),
			dailyUsd: 90,
		});
	});

	test("dates the auto top-up when the balance reaches its threshold", () => {
		const runway = projectCreditRunway({ ...base, balanceNanos: usd(412.8), dailyNanos: usd(90), autoTopUpEnabled: true, autoTopUpThresholdNanos: usd(100) });
		expect(runway).toMatchObject({ kind: "auto_top_up", dailyUsd: 90 });
		expect(new Date((runway as { at: number }).at).toISOString().slice(0, 10)).toBe("2026-10-15");
	});

	test("ignores a threshold when auto top-up is off", () => {
		expect(projectCreditRunway({ ...base, balanceNanos: usd(100), dailyNanos: usd(10), autoTopUpThresholdNanos: usd(50) })).toMatchObject({ kind: "runs_out" });
	});

	test("caps long runways instead of dating them", () => {
		expect(projectCreditRunway({ ...base, balanceNanos: usd(1000), dailyNanos: usd(1) })).toEqual({ kind: "beyond", days: 90, dailyUsd: 1 });
	});

	test("shows nothing without meaningful spend, balance or headroom above the threshold", () => {
		expect(projectCreditRunway({ ...base, balanceNanos: usd(50), dailyNanos: usd(0.004) })).toBeNull();
		expect(projectCreditRunway({ ...base, balanceNanos: 0, dailyNanos: usd(5) })).toBeNull();
		expect(projectCreditRunway({ ...base, balanceNanos: usd(-3), dailyNanos: usd(5) })).toBeNull();
		expect(projectCreditRunway({ ...base, balanceNanos: usd(80), dailyNanos: usd(5), autoTopUpEnabled: true, autoTopUpThresholdNanos: usd(100) })).toBeNull();
	});
});
