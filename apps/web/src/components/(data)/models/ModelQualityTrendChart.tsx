"use client";

import {
	CartesianGrid,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import type { ModelPerformanceQualityPoint } from "@/lib/fetchers/models/getModelPerformance";

type QualityMetric = "toolCallSuccessPct" | "structuredOutputSuccessPct" | "cacheHitRatePct";

const METRICS: Record<QualityMetric, { label: string; color: string }> = {
	toolCallSuccessPct: { label: "Tool call success", color: "hsl(221, 83%, 53%)" },
	structuredOutputSuccessPct: { label: "Structured output", color: "hsl(262, 83%, 58%)" },
	cacheHitRatePct: { label: "Cache hit rate", color: "hsl(142, 71%, 45%)" },
};

export default function ModelQualityTrendChart({
	title,
	data,
	metric,
}: {
	title: string;
	data: ModelPerformanceQualityPoint[];
	metric: QualityMetric;
}) {
	const config = METRICS[metric];
	const chartData = data
		.filter((point) => point[metric] != null && Number.isFinite(point[metric]))
		.map((point) => ({
			bucket: point.bucket,
			value: point[metric],
		}));

	if (!chartData.length) return null;

	return (
		<div className="min-w-0 rounded-lg border border-border/70 bg-background px-4 py-4">
			<div className="h-[228px] w-full min-w-0">
				<div className="mb-3 flex items-center justify-between gap-3">
					<p className="text-lg font-medium leading-none text-foreground">{title}</p>
					<span className="text-[11px] text-muted-foreground">%</span>
				</div>
				<div className="h-[174px] w-full">
					<ResponsiveContainer width="100%" height="100%">
						<LineChart data={chartData} margin={{ top: 8, right: 0, left: 0, bottom: 4 }}>
							<CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" opacity={0.45} />
							<XAxis dataKey="bucket" hide />
							<YAxis domain={[0, 100]} hide />
							<Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`, config.label]} />
							<Line type="monotone" dataKey="value" stroke={config.color} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
						</LineChart>
					</ResponsiveContainer>
				</div>
			</div>
		</div>
	);
}
