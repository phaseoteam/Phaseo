"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import {
	ResponsiveContainer,
	ScatterChart,
	CartesianGrid,
	Scatter,
	XAxis,
	YAxis,
	ZAxis,
	Dot,
} from "recharts";
import { CalendarClock } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
	type ChartConfig,
} from "@/components/ui/chart";
import { Logo } from "@/components/Logo";
import type { BenchmarkPage } from "@/lib/fetchers/benchmarks/types";
import {
	normalizeBenchmarkScoreValue,
	parseBenchmarkScore,
	resolveBenchmarkIsPercentage,
} from "@/lib/benchmarks/scoreFormat";

const ColoredDot = (props: any) => {
	const { cx, cy, payload } = props;
	const handleClick = () => {
		const modelId = payload.modelId;
		if (modelId) {
			window.location.href = `/models/${modelId}`;
		}
	};
	return (
		<Dot
			cx={cx}
			cy={cy}
			r={4}
			fill={payload.color}
			onClick={handleClick}
			style={{ cursor: "pointer" }}
		/>
	);
};

const CustomTooltip = ({ active, payload, tooltipValueFormatter, labels }: any) => {
	if (!active || !payload || !payload.length) return null;

	const data = payload[0].payload;
	const { modelName, orgName, date, color, y, orgId } = data;

	return (
		<div className="rounded-lg border bg-background p-3 shadow-md">
			<div className="flex items-center gap-2 mb-2">
				<Logo
					id={orgId}
					alt={orgName}
					width={16}
					height={16}
					className="w-4 h-4"
					fallback={
						<div
							className="w-3 h-3 rounded-full"
							style={{ backgroundColor: color }}
						/>
					}
				/>
				<span className="font-medium text-sm">{modelName}</span>
			</div>
			<div className="space-y-1 text-xs text-muted-foreground">
				<div>{labels.organization}: {orgName}</div>
				<div>{labels.released}: {date}</div>
				<div className="font-medium text-foreground">
					{labels.score}: {tooltipValueFormatter(y)}
				</div>
			</div>
		</div>
	);
};

interface BenchmarkProgressChartProps {
	benchmark: BenchmarkPage;
}

type ScatterPoint = {
	x: number; // timestamp
	y: number; // score
	modelName: string;
	date: string;
	color: string;
	orgName?: string;
	orgId?: string;
	modelId?: string;
};

function buildScatterData(
	benchmark: BenchmarkPage,
	hasPercentage: boolean,
	locale: string,
	unknownModel: string,
	unknownOrganization: string,
): ScatterPoint[] {
	const results: any[] = benchmark?.results ?? [];

	const points: ScatterPoint[] = [];

	for (const result of results) {
		const numericScore = normalizeBenchmarkScoreValue(
			parseBenchmarkScore(result?.score),
			hasPercentage
		);
		if (numericScore == null) continue;

		const timestamp =
			result.model?.release_date ?? result.model?.announcement_date;
		if (!timestamp) continue;

		const date = new Date(timestamp);
		if (Number.isNaN(date.getTime())) continue;

		const modelName =
			result.model?.name ??
			result.model_id ??
			result.id ??
			unknownModel;

		const color = result.model?.organisation?.colour || "#8884d8"; // default color if no org color
		const orgName = result.model?.organisation?.name || unknownOrganization;
		const orgId = result.model?.organisation?.organisation_id || "";
		const modelId = result.model_id || result.id || "";

		points.push({
			x: date.getTime(),
			y: numericScore,
			modelName,
			date: date.toLocaleDateString(locale),
			color,
			orgName,
			orgId,
			modelId,
		});
	}

	// Sort by date
	points.sort((a, b) => a.x - b.x);

	return points;
}

export default function BenchmarkProgressChart({
	benchmark,
}: BenchmarkProgressChartProps) {
	const locale = useLocale();
	const t = useTranslations("Catalogue.benchmarks");
	const hasPercentage = React.useMemo(
		() => resolveBenchmarkIsPercentage({
			benchmarkType: benchmark?.type,
			fallback: (benchmark?.results ?? []).some(
				(result) =>
					typeof result?.score === "string" &&
					result.score.includes("%")
			),
		}),
		[benchmark?.type, benchmark?.results]
	);

	const scatterData = React.useMemo(
		() => buildScatterData(benchmark, hasPercentage, locale, t("unknownModel"), t("unknownOrganization")),
		[benchmark, hasPercentage, locale, t]
	);
	const monthFormatter = React.useMemo(
		() => new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }),
		[locale]
	);
	const chartConfig: ChartConfig = {
		score: {
			label: t("score"),
			color: "hsl(222 89% 53%)",
		},
	};

	const tooltipValueFormatter = React.useCallback(
		(value: number | string | Array<number | string> | undefined) => {
			if (typeof value !== "number") return value;
			const formatted =
				Math.abs(value) >= 100 || Number.isInteger(value)
					? value.toFixed(0)
					: value.toFixed(2);
			return hasPercentage ? `${formatted}%` : formatted;
		},
		[hasPercentage]
	);

	return (
		<Card className="shadow-md">
			<CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-3">
					<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-200">
						<CalendarClock className="h-5 w-5" />
					</div>
					<div>
						<CardTitle className="text-lg font-semibold">
							{t("progressTitle")}
						</CardTitle>
						<p className="text-sm text-muted-foreground">
							{t("progressDescription")}
						</p>
					</div>
				</div>
			</CardHeader>
			<CardContent className="h-80 pt-2">
				{scatterData.length > 0 ? (
					<ChartContainer
						className="h-full w-full"
						config={chartConfig}
					>
						<ResponsiveContainer width="100%" height="100%">
							<ScatterChart data={scatterData}>
								<CartesianGrid
									strokeDasharray="4 8"
									vertical={false}
									stroke="rgba(148, 163, 184, 0.35)"
								/>
								<XAxis
									type="number"
									dataKey="x"
									tickLine={true}
									axisLine={true}
									minTickGap={16}
									tickFormatter={(value) =>
										monthFormatter.format(new Date(value))
									}
									domain={["dataMin", "dataMax"]}
									tick={{
										fill: "var(--chart-axis-color)",
									}}
								/>
								<YAxis
									tickLine={false}
									axisLine={false}
									width={60}
									tickFormatter={(value) =>
										tooltipValueFormatter(value) as string
									}
									tick={{
										fill: "var(--chart-axis-color)",
									}}
								/>
								<ZAxis range={[50, 50]} />
								<ChartTooltip
									cursor={{ strokeDasharray: "4 4" }}
									content={
						<CustomTooltip
							tooltipValueFormatter={
								tooltipValueFormatter
							}
							labels={{
								organization: t("tooltipOrganization"),
								released: t("tooltipReleased"),
				score: t("score"),
							}}
						/>
									}
								/>
								<Scatter dataKey="y" shape={ColoredDot} />
							</ScatterChart>
						</ResponsiveContainer>
					</ChartContainer>
				) : (
					<div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-300 text-center text-sm text-muted-foreground dark:border-zinc-700">
						{t("noScores")}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
