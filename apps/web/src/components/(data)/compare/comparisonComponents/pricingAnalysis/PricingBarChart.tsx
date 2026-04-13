import React from "react";
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	Tooltip,
	ResponsiveContainer,
	CartesianGrid,
} from "recharts";

type PricingBarChartDatum = {
	model: string;
	input: number | null;
	output: number | null;
	blended: number | null;
	inputProvider: string | null;
	outputProvider: string | null;
};

interface PricingBarChartProps {
	data: PricingBarChartDatum[];
	scaleMode: "linear" | "log";
	CustomTooltip: React.FC<any>;
}

function getNiceMax(value: number): number {
	if (value <= 0) return 1;
	if (value <= 10) return 10;
	const pow = Math.pow(10, Math.floor(Math.log10(value)));
	return Math.ceil(value / pow) * pow;
}

function getLogFloor(value: number): number {
	if (!Number.isFinite(value) || value <= 0) return 0.01;
	return Math.pow(10, Math.floor(Math.log10(value)));
}

function buildLogTicks(min: number, max: number): number[] {
	if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0) return [];
	const ticks: number[] = [];
	const startExp = Math.floor(Math.log10(min));
	const endExp = Math.ceil(Math.log10(max));
	for (let exp = startExp; exp <= endExp; exp += 1) {
		const base = Math.pow(10, exp);
		for (const mul of [1, 2, 5]) {
			const tick = base * mul;
			if (tick >= min && tick <= max) ticks.push(tick);
		}
	}
	return Array.from(new Set(ticks)).sort((a, b) => a - b);
}

function formatAxisUsd(value: number, scaleMode: "linear" | "log"): string {
	if (!Number.isFinite(value)) return "$0";

	if (scaleMode === "linear") {
		return `$${Number(value).toLocaleString("en-US", {
			maximumFractionDigits: 0,
		})}`;
	}

	let maximumFractionDigits = 0;
	if (Math.abs(value) < 1) maximumFractionDigits = 4;
	else if (Math.abs(value) < 10) maximumFractionDigits = 2;

	return `$${Number(value).toLocaleString("en-US", {
		minimumFractionDigits: 0,
		maximumFractionDigits,
	})}`;
}

export default function PricingBarChart({
	data,
	scaleMode,
	CustomTooltip,
}: PricingBarChartProps) {
	const allVals = [
		...data.map((d) => (typeof d.input === "number" ? d.input : 0)),
		...data.map((d) => (typeof d.output === "number" ? d.output : 0)),
		...data.map((d) => (typeof d.blended === "number" ? d.blended : 0)),
	];
	const positiveVals = allVals.filter((value) => value > 0);
	const maxVal = Math.max(...allVals, 0);
	const niceMax = getNiceMax(maxVal);
	const minPositive = positiveVals.length ? Math.min(...positiveVals) : 0.01;
	const logFloor = getLogFloor(minPositive);
	const tickCount = 5;
	const tickStep = Math.max(1, Math.ceil(niceMax / tickCount));
	const linearTicks = Array.from({ length: tickCount + 1 }, (_, i) => i * tickStep);
	const logTicks = buildLogTicks(logFloor, niceMax);

	const preparedData =
		scaleMode === "log"
			? data.map((row) => ({
					...row,
					input:
						typeof row.input === "number" && row.input > 0 ? row.input : null,
					output:
						typeof row.output === "number" && row.output > 0 ? row.output : null,
					blended:
						typeof row.blended === "number" && row.blended > 0 ? row.blended : null,
				}))
			: data;

	return (
		<ResponsiveContainer width="100%" height={340}>
			<BarChart data={preparedData} margin={{ top: 8, right: 8, bottom: 28, left: 4 }}>
				<CartesianGrid stroke="#e5e7eb" vertical={false} strokeDasharray="3 3" />
				<XAxis
					dataKey="model"
					tick={{ fontSize: 12 }}
					axisLine={false}
					tickLine={false}
					interval={0}
					angle={-18}
					textAnchor="end"
					height={58}
				/>
				<YAxis
					type="number"
					scale={scaleMode}
					tick={{ fontSize: 12 }}
					axisLine={false}
					tickLine={false}
					domain={scaleMode === "log" ? [logFloor, niceMax] : [0, niceMax]}
					ticks={scaleMode === "log" ? logTicks : linearTicks}
					tickFormatter={(value) => formatAxisUsd(Number(value), scaleMode)}
					allowDecimals={false}
				/>
				<Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(148,163,184,0.12)" }} />
				<Bar dataKey="input" name="Input" fill="#0ea5e9" barSize={16} radius={[4, 4, 0, 0]} />
				<Bar dataKey="output" name="Output" fill="#10b981" barSize={16} radius={[4, 4, 0, 0]} />
				<Bar
					dataKey="blended"
					name="Blended (90/10)"
					fill="#f59e0b"
					barSize={16}
					radius={[4, 4, 0, 0]}
				/>
			</BarChart>
		</ResponsiveContainer>
	);
}
