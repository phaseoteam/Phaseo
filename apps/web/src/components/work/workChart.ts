// One chart palette for every work chart, stepped separately for light and dark surfaces.
// Categorical slots are used in fixed order so a series keeps its colour wherever it appears.

export const WORK_SERIES = [
	{ light: "#2a78d6", dark: "#3987e5" }, // blue
	{ light: "#eb6834", dark: "#d95926" }, // orange
	{ light: "#1baf7a", dark: "#199e70" }, // aqua
	{ light: "#eda100", dark: "#c98500" }, // yellow
	{ light: "#e87ba4", dark: "#d55181" }, // magenta
	{ light: "#008300", dark: "#008300" }, // green
	{ light: "#6250d6", dark: "#9085e9" }, // violet
	{ light: "#e34948", dark: "#e66767" }, // red
] as const;

/** Reference lines (scope, targets) in a neutral ink rather than a series colour. */
export const WORK_NEUTRAL = { light: "#8a8984", dark: "#7a7975" } as const;

export function seriesTheme(index: number): { light: string; dark: string } {
	const slot = WORK_SERIES[Math.max(0, Math.min(WORK_SERIES.length - 1, index))]!;
	return { light: slot.light, dark: slot.dark };
}
