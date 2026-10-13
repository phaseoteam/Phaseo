import { forecastMonthSpend } from "./monthSpendForecast";

const usd = (value: number) => value * 1_000_000_000;
const day = (date: string, value: number) => ({ date, costNanos: usd(value) });

describe("forecastMonthSpend", () => {
	// Noon on Oct 12: 11.5 days of a 31-day month have passed.
	const observedAt = Date.parse("2026-10-12T12:00:00Z");

	test("projects month-end spend between the month-to-date and recent paces", () => {
		const days = [
			day("2026-09-15", 1000),
			day("2026-09-30", 740),
			...Array.from({ length: 11 }, (_, i) => day(`2026-10-${String(i + 1).padStart(2, "0")}`, i < 4 ? 50 : 100)),
			day("2026-10-12", 50),
		];
		const forecast = forecastMonthSpend({ days, observedAt });
		expect(forecast).not.toBeNull();
		const f = forecast!;
		expect(f.daysInMonth).toBe(31);
		expect(f.elapsedDays).toBe(11.5);
		expect(f.spentNanos).toBe(usd(950));
		// Month pace 950 / 11.5; recent pace is the last 7 full days (Oct 5–11) at $100/day.
		expect(f.midNanos).toBe(Math.round(usd(950) + (usd(950) / 11.5) * 19.5));
		expect(f.lowNanos).toBe(f.midNanos);
		expect(f.highNanos).toBe(usd(950 + 100 * 19.5));
		expect(f.previousMonthNanos).toBe(usd(1740));
		expect(f.cumulative[0]).toEqual({ x: 0, nanos: 0 });
		expect(f.cumulative[1]).toEqual({ x: 1, nanos: usd(50) });
		expect(f.cumulative.at(-1)).toEqual({ x: 11.5, nanos: usd(950) });
	});

	test("uses last month's final week for the recent pace early in the month", () => {
		const forecast = forecastMonthSpend({
			days: [day("2026-09-28", 70), day("2026-10-01", 10)],
			observedAt: Date.parse("2026-10-04T00:00:00Z"),
		});
		expect(forecast?.spentNanos).toBe(usd(10));
		// Sep 27–Oct 3 holds $80 (Sep 28 and Oct 1), so the recent pace is $80/7 over the 28 days left.
		expect(forecast?.highNanos).toBe(usd(10 + (80 / 7) * 28));
	});

	test("waits until three days into the month", () => {
		expect(forecastMonthSpend({ days: [day("2026-10-01", 10)], observedAt: Date.parse("2026-10-03T23:00:00Z") })).toBeNull();
	});

	test("has nothing to project without recent spend", () => {
		expect(forecastMonthSpend({ days: [day("2026-08-15", 10)], observedAt })).toBeNull();
	});

	test("omits last month when there was no spend to compare with", () => {
		expect(forecastMonthSpend({ days: [day("2026-10-02", 20)], observedAt })?.previousMonthNanos).toBeNull();
	});
});
