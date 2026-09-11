import { filterPerformanceRange } from "./ModelPerformanceDashboard";

describe("filterPerformanceRange", () => {
	const latest = Date.parse("2026-09-11T12:00:00Z");
	const points = [
		{ bucket: "2026-09-04T11:00:00Z", value: 1 },
		{ bucket: "2026-09-08T12:00:00Z", value: 2 },
		{ bucket: "2026-09-10T12:00:00Z", value: 3 },
		{ bucket: "2026-09-11T12:00:00Z", value: 4 },
	];

	it.each([
		[1, [3, 4]],
		[3, [2, 3, 4]],
		[7, [2, 3, 4]],
	] as const)("keeps the trailing %d-day window", (days, values) => {
		expect(filterPerformanceRange(points, days, latest).map((point) => point.value)).toEqual(values);
	});

	it("supports daily percentile points", () => {
		expect(
			filterPerformanceRange(
				[{ day: "2026-09-07" }, { day: "2026-09-11" }],
				3,
				latest,
			),
		).toEqual([{ day: "2026-09-11" }]);
	});
});
