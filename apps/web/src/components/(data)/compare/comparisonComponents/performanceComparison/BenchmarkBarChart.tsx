import React from "react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

export const BENCHMARK_SERIES_COLORS = ["#0ea5e9", "#10b981", "#f59e0b", "#6366f1"];

interface BenchmarkBarChartProps {
	chartData: { [key: string]: string | number | null }[];
	models: { name: string }[];
	allPercent: boolean;
	CustomTooltip: React.FC<any>;
}

function getNiceMax(value: number): number {
	if (!Number.isFinite(value) || value <= 0) return 1;
	if (value <= 10) return 10;
	const pow = Math.pow(10, Math.floor(Math.log10(value)));
	return Math.ceil(value / pow) * pow;
}

function formatAxisValue(value: number, allPercent: boolean): string {
	if (!Number.isFinite(value)) return allPercent ? "0%" : "0";
	if (allPercent) {
		return `${value.toLocaleString("en-US", {
			minimumFractionDigits: 0,
			maximumFractionDigits: 1,
		})}%`;
	}
	let digits = 0;
	if (Math.abs(value) < 1) digits = 2;
	else if (Math.abs(value) < 10) digits = 1;
	return value.toLocaleString("en-US", {
		minimumFractionDigits: 0,
		maximumFractionDigits: digits,
	});
}

function extractAllSeriesValues(
	rows: { [key: string]: string | number | null }[],
	series: { name: string }[]
): number[] {
	const values: number[] = [];
	for (const row of rows) {
		for (const model of series) {
			const value = row[model.name];
			if (typeof value === "number" && Number.isFinite(value)) values.push(value);
		}
	}
	return values;
}

export default function BenchmarkBarChart({
	chartData,
	models,
	allPercent,
	CustomTooltip,
}: BenchmarkBarChartProps) {
	const allValues = extractAllSeriesValues(chartData, models);
	const maxVal = Math.max(...allValues, 0);
	const computedMax = allPercent ? Math.max(100, getNiceMax(maxVal)) : getNiceMax(maxVal);
	const linearTicks = allPercent
		? computedMax <= 100
			? [0, 25, 50, 75, 100]
			: (() => {
					const tickCount = 5;
					const step = Math.max(1, Math.ceil(computedMax / tickCount));
					return Array.from({ length: tickCount + 1 }, (_, index) => index * step);
				})()
		: (() => {
				const tickCount = 5;
				const step = Math.max(1, Math.ceil(computedMax / tickCount));
				return Array.from({ length: tickCount + 1 }, (_, index) => index * step);
			})();

	return (
		<ResponsiveContainer width="100%" height={320}>
			<BarChart data={chartData} margin={{ top: 4, right: 24, left: 0, bottom: 18 }}>
				<CartesianGrid strokeDasharray="3 3" vertical={false} />
				<XAxis
					type="category"
					dataKey="benchmark"
					tick={{ fontSize: 12 }}
					interval={0}
					axisLine={false}
					tickLine={false}
					angle={-15}
					textAnchor="end"
					height={56}
				/>
				<YAxis
					type="number"
					domain={[0, computedMax]}
					ticks={linearTicks}
					tickFormatter={(value) => formatAxisValue(Number(value), allPercent)}
					tick={{ fontSize: 12 }}
					axisLine={false}
					tickLine={false}
				/>
				<Tooltip content={<CustomTooltip />} />
				{models.map((model, index) => (
					<Bar
						key={model.name}
						dataKey={model.name}
						name={model.name}
						fill={BENCHMARK_SERIES_COLORS[index % BENCHMARK_SERIES_COLORS.length]}
						radius={[4, 4, 0, 0]}
						maxBarSize={22}
						isAnimationActive={false}
					/>
				))}
			</BarChart>
		</ResponsiveContainer>
	);
}
