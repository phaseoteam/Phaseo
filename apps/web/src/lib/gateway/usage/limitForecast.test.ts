import { forecastLimitWindow, formatLimitResetCountdown, utcLimitWindow } from "./limitForecast";

const at = (iso: string) => Date.parse(iso);

describe("utcLimitWindow", () => {
	test("uses UTC midnight, Monday and the 1st, whatever the local timezone", () => {
		const now = at("2026-10-12T22:30:00Z"); // a Monday, already Tuesday east of UTC
		expect(utcLimitWindow("day", now)).toEqual({ start: at("2026-10-12T00:00:00Z"), end: at("2026-10-13T00:00:00Z") });
		expect(utcLimitWindow("week", now)).toEqual({ start: at("2026-10-12T00:00:00Z"), end: at("2026-10-19T00:00:00Z") });
		expect(utcLimitWindow("month", now)).toEqual({ start: at("2026-10-01T00:00:00Z"), end: at("2026-11-01T00:00:00Z") });
	});

	test("treats Sunday as the end of the week", () => {
		expect(utcLimitWindow("week", at("2026-10-18T23:59:00Z")).start).toBe(at("2026-10-12T00:00:00Z"));
	});

	test("rolls the month over at year end", () => {
		expect(utcLimitWindow("month", at("2026-12-31T12:00:00Z")).end).toBe(at("2027-01-01T00:00:00Z"));
	});
});

describe("formatLimitResetCountdown", () => {
	test("counts down to the UTC reset", () => {
		const now = at("2026-10-12T20:47:30Z");
		expect(formatLimitResetCountdown("day", now)).toBe("3h 13m");
		expect(formatLimitResetCountdown("week", now)).toBe("6d 3h");
		expect(formatLimitResetCountdown("month", now)).toBe("19d 3h");
		expect(formatLimitResetCountdown("day", at("2026-10-12T23:59:50Z"))).toBe("1m");
	});
});

describe("forecastLimitWindow", () => {
	test("projects the month from the pace so far and dates the limit", () => {
		// 12 days into a 31-day month, $96 of a $200 limit.
		const forecast = forecastLimitWindow({ window: "month", used: 96, limit: 200, now: at("2026-10-13T00:00:00Z") });
		expect(forecast?.projected).toBeCloseTo(248, 5);
		expect(forecast?.reachesLimitAt).toBe(at("2026-10-26T00:00:00Z"));
	});

	test("does not date a limit the pace stays under", () => {
		const forecast = forecastLimitWindow({ window: "month", used: 40, limit: 200, now: at("2026-10-13T00:00:00Z") });
		expect(forecast?.projected).toBeCloseTo(103.33, 2);
		expect(forecast?.reachesLimitAt).toBeNull();
	});

	test("waits until enough of the window has passed", () => {
		expect(forecastLimitWindow({ window: "day", used: 5, limit: 10, now: at("2026-10-12T02:59:00Z") })).toBeNull();
		expect(forecastLimitWindow({ window: "week", used: 5, limit: 10, now: at("2026-10-12T23:00:00Z") })).toBeNull();
		expect(forecastLimitWindow({ window: "month", used: 5, limit: 10, now: at("2026-10-03T23:00:00Z") })).toBeNull();
		expect(forecastLimitWindow({ window: "day", used: 5, limit: 10, now: at("2026-10-12T03:00:00Z") })).not.toBeNull();
	});

	test("leaves an already-reached limit to the usage display", () => {
		const forecast = forecastLimitWindow({ window: "day", used: 12, limit: 10, now: at("2026-10-12T12:00:00Z") });
		expect(forecast?.projected).toBe(24);
		expect(forecast?.reachesLimitAt).toBeNull();
	});

	test("projects keys without a limit but never dates one", () => {
		const forecast = forecastLimitWindow({ window: "week", used: 50, limit: 0, now: at("2026-10-14T00:00:00Z") });
		expect(forecast?.projected).toBe(175);
		expect(forecast?.reachesLimitAt).toBeNull();
	});

	test("projects nothing from no usage", () => {
		expect(forecastLimitWindow({ window: "month", used: 0, limit: 200, now: at("2026-10-20T00:00:00Z") })).toEqual({ projected: 0, reachesLimitAt: null });
	});
});
