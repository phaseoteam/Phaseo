import type { ObservabilityTimeSeriesChart } from "./types";

const INTERACTIVE_TREND_CHART_SELECTOR = [
	"a",
	"button",
	"[role='switch']",
	"[role='menuitem']",
	"[data-slot='popover-content']",
].join(",");

export function shouldOpenTrendExplore(
	target: Pick<Element, "closest">,
): boolean {
	return target.closest(INTERACTIVE_TREND_CHART_SELECTOR) === null;
}

export function stopTrendControlClick(event: {
	stopPropagation: () => void;
}): void {
	event.stopPropagation();
}

export function prepareTrendChartData(
	data: ObservabilityTimeSeriesChart,
	options: { showOther: boolean; cumulative: boolean },
): ObservabilityTimeSeriesChart {
	const series = options.showOther
		? data.series
		: data.series.filter((item) => item.id !== "other");
	if (!options.cumulative) {
		return {
			series,
			data: data.data.map((point) => {
				const next: Record<string, string | number> = {
					bucket: point.bucket ?? "",
					label: point.label ?? "",
				};
				for (const item of series) next[item.id] = Number(point[item.id] ?? 0);
				return next;
			}),
		};
	}
	const running = new Map(series.map((item) => [item.id, 0]));
	return {
		series,
		data: data.data.map((point) => {
			const next: Record<string, string | number> = {
				bucket: point.bucket ?? "",
				label: point.label ?? "",
			};
			for (const item of series) {
				const value = (running.get(item.id) ?? 0) + Number(point[item.id] ?? 0);
				running.set(item.id, value);
				next[item.id] = value;
			}
			return next;
		}),
	};
}
