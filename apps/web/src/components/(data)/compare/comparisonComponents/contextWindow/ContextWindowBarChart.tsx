"use client";

import React from "react";
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	Tooltip,
	ResponsiveContainer,
	CartesianGrid,
	Legend,
} from "recharts";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";

interface ContextWindowBarChartProps {
	chartData: { [key: string]: string | number | null }[];
	models: { name: string; provider: string }[];
	CustomTooltip: React.FC<any>;
	barGap?: number;
}

// Helper to format numbers as K/M/B
export default function ContextWindowBarChart({
	chartData,
	models,
	CustomTooltip,
	barGap = 32,
}: ContextWindowBarChartProps) {
	const format = useDisplayFormatters();
	const formatTokens = (value: number | null | undefined) =>
		value == null ? "-" : format.number(value, { maximumFractionDigits: 1 });
	const data = models.map((model) => ({
		model: model.name,
		input: chartData[0][model.name],
		inputProvider: model.provider,
		output: chartData[1][model.name],
		outputProvider: model.provider,
	}));

	const COLORS = {
		input: "#38bdf8", // sky blue
		output: "#f472b6", // pink
	};

	function getNumber(val: string | number | undefined | null): number {
		if (typeof val === "number") return val;
		if (typeof val === "string") return parseFloat(val) || 0;
		return 0;
	}

	const allVals = [
		...data.map((d) => (typeof d.input === "number" ? d.input : 0)),
		...data.map((d) => (typeof d.output === "number" ? d.output : 0)),
	];
	const maxVal = Math.max(...allVals, 0);
	function getNiceMax(val: number) {
		if (val <= 10000) return 10000;
		const pow = Math.pow(10, Math.floor(Math.log10(val)));
		return Math.ceil(val / pow) * pow;
	}
	const niceMax = getNiceMax(maxVal);
	const tickCount = 5;
	const tickStep = Math.ceil(niceMax / tickCount);
	const ticks = Array.from({ length: tickCount + 1 }, (_, i) => i * tickStep);

	return (
		<ResponsiveContainer width="100%" height={300}>
			<BarChart
				data={data}
				layout="vertical"
				margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
				barCategoryGap={32}
			>
				<CartesianGrid
					stroke="#e5e7eb"
					horizontal={false}
					vertical={true}
				/>
				<XAxis
					type="number"
					tick={{ fontSize: 13 }}
					axisLine={false}
					tickLine={false}
					domain={[0, niceMax]}
					ticks={ticks}
					tickFormatter={formatTokens}
					allowDecimals={false}
				/>
				<YAxis
					type="category"
					dataKey="model"
					tick={{ fontSize: 16, fontWeight: 600 }}
					axisLine={false}
					tickLine={false}
					width={140}
				/>
				<Tooltip
					content={<CustomTooltip formatTokens={formatTokens} />}
				/>
				<Legend
					verticalAlign="top"
					align="center"
					iconType="circle"
					wrapperStyle={{ fontSize: 14, marginBottom: 12 }}
				/>
				<Bar
					dataKey="input"
					name="Input Context"
					fill={COLORS.input}
					barSize={36}
					radius={[0, 10, 10, 0]}
					isAnimationActive={false}
				/>
				<Bar
					dataKey="output"
					name="Output Context"
					fill={COLORS.output}
					barSize={36}
					radius={[0, 10, 10, 0]}
					isAnimationActive={false}
				/>
			</BarChart>
		</ResponsiveContainer>
	);
}
