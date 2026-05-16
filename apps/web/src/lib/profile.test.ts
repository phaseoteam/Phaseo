import {
	buildDailyActivitySeries,
	buildHeatmapDays,
	buildPublicProfileSlug,
	calculatePeriodChange,
	calculateStreaks,
} from "./profile"

describe("profile helpers", () => {
	it("builds a deterministic public profile slug", () => {
		expect(
			buildPublicProfileSlug(
				"Daniel Butler",
				"12345678-90ab-cdef-1234-567890abcdef",
			),
		).toBe("daniel-butler-12345678")
	})

	it("calculates streaks from daily request activity", () => {
		const result = calculateStreaks([
			{ requests: 1 },
			{ requests: 2 },
			{ requests: 0 },
			{ requests: 3 },
			{ requests: 4 },
			{ requests: 5 },
		])

		expect(result).toEqual({
			current: 3,
			longest: 3,
			activeDays: 5,
		})
	})

	it("builds a zero-filled activity series", () => {
		const points = buildDailyActivitySeries(
			new Map([
				["2026-05-10", { requests: 7, tokens: 70 }],
			]),
			3,
			new Date("2026-05-11T12:00:00.000Z"),
		)

		expect(points).toEqual([
			{ date: "2026-05-09", requests: 0, tokens: 0, spendNanos: 0 },
			{ date: "2026-05-10", requests: 7, tokens: 70, spendNanos: 0 },
			{ date: "2026-05-11", requests: 0, tokens: 0, spendNanos: 0 },
		])
	})

	it("handles period change when the previous period is empty", () => {
		expect(calculatePeriodChange(5, 0)).toBe(100)
		expect(calculatePeriodChange(0, 0)).toBeNull()
	})

	it("builds heatmap days with requests, tokens, spend, and full weekday labels", () => {
		const days = buildHeatmapDays(
			new Map([
				["2026-05-11", { requests: 3, tokens: 1200, spendNanos: 25_000_000 }],
			]),
			new Date("2026-05-12T12:00:00.000Z"),
			1,
		)

		expect(days).toHaveLength(7)
		expect(days[0]).toEqual(
			expect.objectContaining({
				date: "2026-05-11",
				requests: 3,
				tokens: 1200,
				spendNanos: 25_000_000,
				weekdayLabel: "M",
				inTrailingWindow: true,
				isFuture: false,
			}),
		)
		expect(days[1]).toEqual(
			expect.objectContaining({
				date: "2026-05-12",
				weekdayLabel: "T",
				inTrailingWindow: true,
				isFuture: false,
			}),
		)
		expect(days[6]).toEqual(
			expect.objectContaining({
				date: "2026-05-17",
				weekdayLabel: "S",
				isFuture: true,
			}),
		)
	})
})
