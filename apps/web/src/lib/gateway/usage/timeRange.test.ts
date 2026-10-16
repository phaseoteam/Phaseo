import {
	formatUsageComparisonRange,
	getUsageRangeBadgeLabel,
	getUsageRangeLabel,
	getUsageRangeTriggerLabel,
	parseUsageRangePreset,
	parseUsageRelativeShorthand,
	resolvePreviousUsageTimeRange,
	resolveUsageTimeRange,
	serializeUsageRangePreset,
	type UsageRangePreset,
} from "./timeRange";

describe("usage time range", () => {
	test("parses arbitrary shorthand ranges", () => {
		expect(parseUsageRelativeShorthand("4w")).toBe("4w");
		expect(parseUsageRelativeShorthand("2Y")).toBe("2y");
		expect(parseUsageRelativeShorthand("1mo")).toBe("1mo");
		expect(parseUsageRelativeShorthand("abc")).toBeNull();
	});

	test("maps quick aliases and preserves relative shorthand", () => {
		expect(parseUsageRangePreset("15m")).toBe("past_15m");
		expect(parseUsageRangePreset("1w")).toBe("last_7d");
		expect(parseUsageRangePreset("4w")).toBe("rel:4w");
		expect(serializeUsageRangePreset("rel:2y")).toBe("2y");
	});

	test("resolves relative shorthand from now", () => {
		const now = new Date("2026-05-12T09:28:00.000Z");
		const range = resolveUsageTimeRange({
			preset: "rel:4w",
			now,
		});

		expect(range.to).toBe("2026-05-12T09:28:00.000Z");
		expect(range.from).toBe("2026-04-14T09:28:00.000Z");
	});

	test("resolves current periods to now and previous periods to closed windows", () => {
		const now = new Date("2026-05-12T09:28:00.000Z");
		const localTodayStart = new Date(2026, 4, 12, 0, 0, 0, 0).toISOString();
		const previousYearStart = new Date(2025, 0, 1, 0, 0, 0, 0).toISOString();
		const previousYearEnd = new Date(2025, 11, 31, 23, 59, 59, 999).toISOString();

		expect(
			resolveUsageTimeRange({
				preset: "today",
				now,
			}),
		).toEqual({
			from: localTodayStart,
			to: "2026-05-12T09:28:00.000Z",
		});

		expect(
			resolveUsageTimeRange({
				preset: "last_year",
				now,
			}),
		).toEqual({
			from: previousYearStart,
			to: previousYearEnd,
		});
	});

	test("builds compact badges for anchored periods", () => {
		const now = new Date("2026-05-12T09:28:00.000Z");

		expect(getUsageRangeBadgeLabel({ preset: "this_month", now })).toBe("11d");
		expect(getUsageRangeBadgeLabel({ preset: "this_year", now })).toBe("4mo");
	});

	test("supports a rolling year and formats ranges with 24-hour times", () => {
		const now = new Date("2026-05-12T09:28:00.000Z");
		expect(getUsageRangeLabel({ preset: "past_1y" })).toBe("Past 1 Year");
		expect(resolveUsageTimeRange({ preset: "past_1y", now })).toEqual({
			from: "2025-05-12T09:28:00.000Z",
			to: "2026-05-12T09:28:00.000Z",
		});
		expect(getUsageRangeTriggerLabel({
			preset: "custom",
			customFrom: "2025-12-31T23:30",
			customTo: "2026-01-01T01:00",
			now,
		})).toBe("Dec 31, 2025, 23:30 – Jan 1, 2026, 01:00");
	});

	test("labels an unset custom range without truncation punctuation", () => {
		expect(getUsageRangeLabel({ preset: "custom" })).toBe("Custom Range");
	});
});

describe("previous usage range", () => {
	const local = (...parts: [number, number, number, number?, number?, number?, number?]) => new Date(...parts).toISOString();
	const previous = (preset: UsageRangePreset, now: Date) => resolvePreviousUsageTimeRange({ preset, ...resolveUsageTimeRange({ preset, now }) });

	test("compares a period so far with the same point in the one before", () => {
		const now = new Date(2026, 9, 15, 9, 12);
		expect(previous("today", now)).toEqual({ from: local(2026, 9, 14), to: local(2026, 9, 14, 9, 12) });
		expect(previous("this_week", now)).toEqual({ from: local(2026, 9, 5), to: local(2026, 9, 8, 9, 12) });
		expect(previous("this_month", now)).toEqual({ from: local(2026, 8, 1), to: local(2026, 8, 15, 9, 12) });
		expect(previous("this_quarter", now)).toEqual({ from: local(2026, 6, 1), to: local(2026, 6, 15, 9, 12) });
		expect(previous("this_year", now)).toEqual({ from: local(2025, 0, 1), to: local(2025, 9, 15, 9, 12) });
		// No 31 September, so the month so far stops at the end of September.
		expect(previous("this_month", new Date(2026, 9, 31, 8))).toEqual({ from: local(2026, 8, 1), to: local(2026, 8, 30, 8) });
	});

	test("compares a finished calendar period with the whole one before", () => {
		const now = new Date(2026, 9, 15, 9, 12);
		expect(previous("yesterday", now)).toEqual({ from: local(2026, 9, 13), to: local(2026, 9, 13, 23, 59, 59, 999) });
		expect(previous("last_week", now)).toEqual({ from: local(2026, 8, 28), to: local(2026, 9, 4, 23, 59, 59, 999) });
		expect(previous("last_month", now)).toEqual({ from: local(2026, 7, 1), to: local(2026, 7, 31, 23, 59, 59, 999) });
		expect(previous("last_quarter", now)).toEqual({ from: local(2026, 3, 1), to: local(2026, 5, 30, 23, 59, 59, 999) });
		expect(previous("last_year", now)).toEqual({ from: local(2024, 0, 1), to: local(2024, 11, 31, 23, 59, 59, 999) });
	});

	test("compares rolling and custom windows with the same length before", () => {
		expect(resolvePreviousUsageTimeRange({ preset: "past_24h", from: "2026-10-14T09:00:00.000Z", to: "2026-10-15T09:00:00.000Z" }))
			.toEqual({ from: "2026-10-13T09:00:00.000Z", to: "2026-10-14T09:00:00.000Z" });
		expect(resolvePreviousUsageTimeRange({ preset: "custom", from: "2026-10-01T00:00:00.000Z", to: "2026-10-03T00:00:00.000Z" }))
			.toEqual({ from: "2026-09-29T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" });
	});

	test("formats whole days without times and other ranges with them", () => {
		const now = new Date(2026, 9, 15, 9, 12);
		// ICU separates ranges with thin spaces in some versions.
		const format = (from: string, to: string) => formatUsageComparisonRange({ from, to, locale: "en-GB", now }).replace(/[  ]/g, " ");
		expect(format(local(2026, 7, 1), local(2026, 7, 31, 23, 59, 59, 999))).toBe("1 – 31 Aug");
		expect(format(local(2026, 9, 14), local(2026, 9, 14, 23, 59, 59, 999))).toBe("14 Oct");
		expect(format(local(2026, 9, 14), local(2026, 9, 14, 9, 12))).toBe("14 Oct, 00:00–09:12");
		expect(format(local(2025, 0, 1), local(2025, 11, 31, 23, 59, 59, 999))).toBe("1 Jan – 31 Dec 2025");
	});
});
