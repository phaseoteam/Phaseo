import {
	prepareTrendChartData,
	shouldOpenTrendExplore,
	stopTrendControlClick,
} from "./trendChart";
import type { ObservabilityTimeSeriesChart } from "./types";

describe("trend chart interactions", () => {
	it("keeps Base UI popover interactions in the current Usage view", () => {
		const closest = jest.fn((selector: string) =>
			selector.includes("[data-slot='popover-content']")
				? ({} as Element)
				: null,
		);

		expect(shouldOpenTrendExplore({ closest })).toBe(false);
		expect(closest).toHaveBeenCalledTimes(1);
	});

	it("stops a portaled control click before it reaches the chart card", () => {
		const stopPropagation = jest.fn();

		stopTrendControlClick({ stopPropagation });

		expect(stopPropagation).toHaveBeenCalledTimes(1);
	});

	it("still opens Explore for a non-interactive chart click", () => {
		expect(
			shouldOpenTrendExplore({ closest: () => null }),
		).toBe(true);
	});

	it("applies a cumulative sum without changing the source chart", () => {
		const source: ObservabilityTimeSeriesChart = {
			series: [
				{ id: "primary", label: "Primary" },
				{ id: "other", label: "Other" },
			],
			data: [
				{ bucket: "2026-08-09", label: "9 Aug", primary: 2, other: 5 },
				{ bucket: "2026-08-10", label: "10 Aug", primary: 3, other: 7 },
			],
		};

		const result = prepareTrendChartData(source, {
			showOther: false,
			cumulative: true,
		});

		expect(result.series).toEqual([{ id: "primary", label: "Primary" }]);
		expect(result.data).toEqual([
			{ bucket: "2026-08-09", label: "9 Aug", primary: 2 },
			{ bucket: "2026-08-10", label: "10 Aug", primary: 5 },
		]);
		expect(source.data[1]?.primary).toBe(3);
	});
});
