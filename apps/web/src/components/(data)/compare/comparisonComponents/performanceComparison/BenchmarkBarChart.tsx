import React from "react";
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	Tooltip,
	ResponsiveContainer,
	Legend,
	CartesianGrid,
	LabelList,
} from "recharts";

const PASTEL_COLORS = [
	// sky-500, emerald-500, amber-500, indigo-500
	"#0ea5e9", // sky-500
	"#10b981", // emerald-500
	"#f59e0b", // amber-500
	"#6366f1", // indigo-500
];

function getMaxScores(
	chartData: { [key: string]: string | number | null }[],
	models: { name: string }[]
) {
	const maxScores: Record<string, number> = {};
	chartData.forEach((row) => {
		let max = -Infinity;
		models.forEach((model) => {
			const val =
				typeof row[model.name] === "number"
					? (row[model.name] as number)
					: -Infinity;
			if (val > max) max = val;
		});
		maxScores[row.benchmark as string] = max;
	});
	return maxScores;
}

export default function BenchmarkBarChart({
	chartData,
	models,
	CustomTooltip,
}: {
	chartData: { [key: string]: string | number | null }[];
	models: { name: string }[];
	CustomTooltip: React.FC<any>;
}) {
	const maxScores = getMaxScores(chartData, models);
	return (
		<ResponsiveContainer width="100%" height={360}>
			<BarChart
				data={chartData}
				margin={{ left: 0, right: 0, top: 0, bottom: 32 }}
				barCategoryGap="60%"
				barGap={2}
			>
				<Legend verticalAlign="top" height={64} />
				<XAxis
					type="category"
					dataKey="benchmark"
					fontSize={12}
					textAnchor="end"
					angle={-10}
					interval={0}
					minTickGap={0}
					axisLine={false}
				/>
				<YAxis
					type="number"
					domain={[0, 100]}
					tick={{ fontSize: 12 }}
					axisLine={false}
					interval={0}
					allowDecimals={false}
					tickLine={false}
				/>
				<CartesianGrid
					stroke="#d1d5db"
					strokeDasharray="0 0 0 0"
					horizontal
					vertical={false}
				/>
				<Tooltip content={<CustomTooltip />} />
				{models.map((model, idx) => (
					<Bar
						key={model.name}
						dataKey={model.name}
						fill={PASTEL_COLORS[idx % PASTEL_COLORS.length]}
						barSize={40}
						isAnimationActive={false}
						shape={(props: any) => {
							const { x, y, width, height, payload } = props;
							const value = props[model.name];
							const max = maxScores[payload.benchmark];
							// Find all model values for this benchmark
							const values = models.map((m) =>
								typeof payload[m.name] === "number"
									? payload[m.name]
									: -Infinity
							);
							const localMax = Math.max(...values);
							const faded = value !== localMax;
							return (
								<rect
									x={x}
									y={y}
									width={width}
									height={height}
									fill={
										PASTEL_COLORS[
											idx % PASTEL_COLORS.length
										]
									}
									fillOpacity={faded ? 0.5 : 1}
								/>
							);
						}}
					>
						<LabelList
							dataKey={model.name}
							position="top"
							formatter={(value: number) =>
								value != null && !isNaN(value)
									? value.toFixed(1)
									: ""
							}
							fontSize={12}
						/>
					</Bar>
				))}
			</BarChart>
		</ResponsiveContainer>
	);
}
