import {
	getUsageRangeBadgeLabel,
	parseUsageRangePreset,
	parseUsageRelativeShorthand,
	resolveUsageTimeRange,
	serializeUsageRangePreset,
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
});
