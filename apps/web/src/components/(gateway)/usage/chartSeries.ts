"use client";

export const OTHER_SERIES_KEY = "__other";

export type ChartSeriesRow = {
	bucket: string;
	[key: string]: string | number;
};

function toFiniteNumber(value: string | number | undefined): number {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : 0;
	}
	if (typeof value === "string") {
		const n = Number(value);
		return Number.isFinite(n) ? n : 0;
	}
	return 0;
}

export function reduceChartSeries(
	rows: ChartSeriesRow[],
	maxSeries: number,
): {
	rows: ChartSeriesRow[];
	seriesKeys: string[];
	hiddenSeriesCount: number;
	totalSeries: number;
} {
	if (rows.length === 0 || maxSeries <= 0) {
		return {
			rows,
			seriesKeys: [],
			hiddenSeriesCount: 0,
			totalSeries: 0,
		};
	}

	const totalsBySeries = new Map<string, number>();

	for (const row of rows) {
		for (const [key, value] of Object.entries(row)) {
			if (key === "bucket") continue;
			const n = toFiniteNumber(value as string | number | undefined);
			totalsBySeries.set(key, (totalsBySeries.get(key) ?? 0) + n);
		}
	}

	const sortedSeries = Array.from(totalsBySeries.entries())
		.sort((a, b) => b[1] - a[1])
		.map(([key]) => key);
	const visibleSeries = sortedSeries.slice(0, maxSeries);
	const hiddenSeries = sortedSeries.slice(maxSeries);
	const visibleSet = new Set(visibleSeries);
	const includeOther = hiddenSeries.length > 0;

	const reducedRows: ChartSeriesRow[] = rows.map((row) => {
		const next: ChartSeriesRow = { bucket: row.bucket };
		for (const key of visibleSeries) {
			next[key] = 0;
		}
		if (includeOther) {
			next[OTHER_SERIES_KEY] = 0;
		}

		let otherSum = 0;
		for (const [key, value] of Object.entries(row)) {
			if (key === "bucket") continue;
			const n = toFiniteNumber(value as string | number | undefined);
			if (visibleSet.has(key)) {
				next[key] = n;
			} else {
				otherSum += n;
			}
		}

		if (includeOther) {
			next[OTHER_SERIES_KEY] = otherSum;
		}

		return next;
	});

	return {
		rows: reducedRows,
		seriesKeys: includeOther
			? [...visibleSeries, OTHER_SERIES_KEY]
			: visibleSeries,
		hiddenSeriesCount: hiddenSeries.length,
		totalSeries: sortedSeries.length,
	};
}
