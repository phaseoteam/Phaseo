"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { formatArtificialAnalysisScore, isArtificialAnalysisBenchmark, isArtificialAnalysisCostBenchmark } from "@/lib/benchmarks/artificialAnalysis";
import {
	ResponsiveContainer,
	ScatterChart,
	CartesianGrid,
	Scatter,
	XAxis,
	YAxis,
	ZAxis,
	Dot,
	ReferenceDot,
	ReferenceLine,
} from "recharts";
import { CalendarClock } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	ChartContainer,
	ChartTooltip,
	type ChartConfig,
} from "@/components/ui/chart";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BenchmarkPage } from "@/lib/fetchers/benchmarks/types";
import {
	normalizeBenchmarkScoreValue,
	parseBenchmarkScore,
	resolveBenchmarkIsPercentage,
} from "@/lib/benchmarks/scoreFormat";

const ColoredDot = (props: any) => {
	const { cx, cy, payload } = props;
	const router = useRouter();
	const handleClick = () => {
		const modelId = payload.modelId;
		if (modelId) {
			router.push(`/models/${modelId}`);
		}
	};
	return (
		<Dot
			cx={cx}
			cy={cy}
			r={4}
			fill={payload.color}
			stroke="rgba(255,255,255,0.4)"
			strokeWidth={1}
			onClick={handleClick}
			style={{ cursor: "pointer" }}
		/>
	);
};

const CustomTooltip = ({ active, payload, tooltipValueFormatter }: any) => {
	if (!active || !payload || !payload.length) return null;

	const scoreEntry = payload.find((entry: any) => entry.name === "Score");
	if (!scoreEntry) return null;
	const data = scoreEntry.payload;
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
				<div>Organization: {orgName}</div>
				<div>Released: {date}</div>
				<div className="font-medium text-foreground">
					Score: {tooltipValueFormatter(y)}
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
	configuration: string;
	frontierLabel?: string;
};

function configurationLabel(result: any) {
	const variant = typeof result?.variant === "string" ? result.variant : null;
	if (variant === "none") return "Non-reasoning";
	if (variant === "xhigh") return "Xhigh";
	if (variant) return variant.charAt(0).toUpperCase() + variant.slice(1);
	const detail = typeof result?.other_info === "string" ? result.other_info.match(/\((.+)\)/)?.[1] : null;
	if (/max effort/i.test(detail ?? "")) return "Max";
	const effort = detail?.match(/\b(none|low|medium|high|xhigh|max)\b/i)?.[1];
	return effort ? (effort.toLowerCase() === "none" ? "Non-reasoning" : effort.charAt(0).toUpperCase() + effort.slice(1).toLowerCase()) : "Default";
}

const monthFormatter = new Intl.DateTimeFormat("en-GB", {
	month: "short",
	year: "numeric",
});

function buildScatterData(
	benchmark: BenchmarkPage,
	hasPercentage: boolean
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

		const baseModelName =
			result.model?.name ??
			result.model_id ??
			result.id ??
			"Unknown model";
		const configuration = configurationLabel(result);
		const modelName = `${baseModelName} (${configuration})`;

		const color = result.model?.organisation?.colour || "#8884d8"; // default color if no org color
		const orgName = result.model?.organisation?.name || "Unknown";
		const orgId = result.model?.organisation?.organisation_id || "";
		const modelId = result.model_id || result.id || "";

		points.push({
			x: date.getTime(),
			y: numericScore,
			modelName,
			date: date.toLocaleDateString(),
			color,
			orgName,
			orgId,
			modelId,
			configuration,
		});
	}

	// Sort by date
	points.sort((a, b) => a.x - b.x);

	return points;
}

const chartConfig: ChartConfig = {
	score: {
		label: "Score",
		color: "hsl(222 89% 53%)",
	},
};

export default function BenchmarkProgressChart({
	benchmark,
}: BenchmarkProgressChartProps) {
	const [range, setRange] = React.useState<"3m" | "6m" | "1y" | "2y" | "3y" | "all">("all");
	const [organisation, setOrganisation] = React.useState("all");
	const [configuration, setConfiguration] = React.useState("all");
	const [modelQuery, setModelQuery] = React.useState("");
	const hasPercentage = resolveBenchmarkIsPercentage({
			benchmarkType: benchmark?.type,
			fallback: (benchmark?.results ?? []).some(
				(result) =>
					typeof result?.score === "string" &&
					result.score.includes("%")
			),
		});

	const scatterData = React.useMemo(
		() => buildScatterData(benchmark, hasPercentage),
		[benchmark, hasPercentage]
	);
	const organisations = React.useMemo(() => [...new Map(scatterData.filter((point) => point.orgId).map((point) => [point.orgId!, point.orgName || point.orgId!])).entries()].sort((left, right) => left[1].localeCompare(right[1])), [scatterData]);
	const configurations = React.useMemo(() => [...new Set(scatterData.map((point) => point.configuration))].sort(), [scatterData]);
	const filteredScatterData = React.useMemo(() => {
		const latest = Math.max(...scatterData.map((point) => point.x), 0);
		const rangeAmount = range === "3m" ? { months: 3 } : range === "6m" ? { months: 6 } : range === "1y" ? { years: 1 } : range === "2y" ? { years: 2 } : range === "3y" ? { years: 3 } : null;
		const cutoffDate = new Date(latest);
		if (rangeAmount?.months) cutoffDate.setMonth(cutoffDate.getMonth() - rangeAmount.months);
		if (rangeAmount?.years) cutoffDate.setFullYear(cutoffDate.getFullYear() - rangeAmount.years);
		const cutoff = rangeAmount ? cutoffDate.getTime() : Number.NEGATIVE_INFINITY;
		const query = modelQuery.trim().toLocaleLowerCase();
		return scatterData.filter((point) => point.x >= cutoff && (organisation === "all" || point.orgId === organisation) && (configuration === "all" || point.configuration === configuration) && (!query || `${point.modelName} ${point.orgName ?? ""}`.toLocaleLowerCase().includes(query)));
	}, [scatterData, range, organisation, configuration, modelQuery]);

	const tooltipValueFormatter = React.useCallback(
		(value: number | string | Array<number | string> | undefined) => {
			if (typeof value !== "number") return value;
			if (isArtificialAnalysisBenchmark(benchmark.id)) return formatArtificialAnalysisScore(benchmark.id, value);
			const formatted =
				Math.abs(value) >= 100 || Number.isInteger(value)
					? value.toFixed(0)
					: value.toFixed(2);
			return hasPercentage ? `${formatted}%` : formatted;
		},
		[hasPercentage, benchmark.id]
	);
	const chartStateKey = `${range}:${organisation}:${configuration}:${modelQuery}`;
	const paretoData = React.useCallback((data: ScatterPoint[]) => {
		const lowerIsBetter = isArtificialAnalysisCostBenchmark(benchmark.id);
		const pointsByDate = new Map<number, ScatterPoint>();
		for (const point of data) {
			const current = pointsByDate.get(point.x);
			if (!current || (lowerIsBetter ? point.y < current.y : point.y > current.y)) pointsByDate.set(point.x, point);
		}
		const bestByDate = [...pointsByDate.values()].sort((left, right) => left.x - right.x);
		let bestScore = lowerIsBetter ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
		const frontier = bestByDate.filter((point) => {
			const improves = lowerIsBetter ? point.y < bestScore : point.y > bestScore;
			if (improves) bestScore = point.y;
			return improves;
		});
		if (frontier.length === 0) return frontier;
		const first = frontier[0];
		const last = frontier.at(-1)!;
		const minimumGap = Math.max((last.x - first.x) * 0.09, 1);
		let lastLabelX = first.x;
		return frontier.map((point, index) => {
			const isFirst = index === 0;
			const isLast = index === frontier.length - 1;
			const hasRoom = point.x - lastLabelX >= minimumGap && last.x - point.x >= minimumGap;
			if (hasRoom) lastLabelX = point.x;
			return { ...point, frontierLabel: isFirst || isLast || hasRoom ? point.modelName.replace(/ \([^)]+\)$/, "") : "" };
		});
	}, [benchmark.id]);
	const chart = (data: ScatterPoint[]) => {
		if (data.length === 0) return (
			<div className="flex h-full items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">No scores match these filters.</div>
		);
		const frontier = paretoData(data);
		return (
		<ChartContainer key={chartStateKey} className="h-full w-full" config={chartConfig}>
			<ResponsiveContainer width="100%" height="100%">
				<ScatterChart data={data} margin={{ top: 28, right: 12, bottom: 4, left: 0 }}>
					<CartesianGrid strokeDasharray="4 8" vertical={false} stroke="rgba(148, 163, 184, 0.28)" />
					<XAxis type="number" dataKey="x" tickLine={false} axisLine={false} minTickGap={24} tickFormatter={(value) => monthFormatter.format(new Date(value))} domain={["dataMin", "dataMax"]} tick={{ fill: "var(--chart-axis-color)" }} />
					<YAxis tickLine={false} axisLine={false} width={52} tickFormatter={(value) => tooltipValueFormatter(value) as string} tick={{ fill: "var(--chart-axis-color)" }} />
					<ZAxis range={[50, 50]} />
					<ChartTooltip shared={false} cursor={{ strokeDasharray: "4 4" }} content={<CustomTooltip tooltipValueFormatter={tooltipValueFormatter} />} />
					{frontier.slice(1).map((point, index) => <ReferenceLine key={`${frontier[index].x}-${point.x}`} segment={[{ x: frontier[index].x, y: frontier[index].y }, { x: point.x, y: point.y }]} stroke="#8b5cf6" strokeWidth={2} />)}
					{frontier.filter((point) => point.frontierLabel).map((point) => <ReferenceDot key={`${point.x}-${point.modelId}`} x={point.x} y={point.y} r={0} label={{ value: point.frontierLabel, position: "top", fill: "var(--foreground)", fontSize: 10 }} />)}
					<Scatter name="Score" dataKey="y" shape={ColoredDot} />
				</ScatterChart>
			</ResponsiveContainer>
		</ChartContainer>
	);
	};

	if (isArtificialAnalysisBenchmark(benchmark.id)) {
		return <div className="space-y-4 border-t pt-6">
			<div className="flex flex-col gap-3">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div><h3 className="text-lg font-semibold">Score Progress</h3><p className="mt-1 text-sm text-muted-foreground">Compare Model Scores by Release Date.</p></div>
					<div className="flex rounded-md border p-0.5" role="group" aria-label="Progress Time Range">{(["3m", "6m", "1y", "2y", "3y", "all"] as const).map((value) => <Button key={value} type="button" variant={range === value ? "secondary" : "ghost"} size="sm" className="h-7 min-w-10 px-2 text-xs" onClick={() => setRange(value)}>{value === "all" ? "All" : value.toUpperCase()}</Button>)}</div>
				</div>
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
					<Input aria-label="Filter Progress by Model" placeholder="Filter Models" value={modelQuery} onChange={(event) => setModelQuery(event.target.value)} className="sm:w-48" />
					<Select value={organisation} onValueChange={setOrganisation}><SelectTrigger aria-label="Filter Progress by Organisation" className="sm:w-52"><SelectValue>{organisation === "all" ? "All Organisations" : <><Logo id={organisation} alt="" width={16} height={16} className="size-4 object-contain" />{organisations.find(([id]) => id === organisation)?.[1] ?? organisation}</>}</SelectValue></SelectTrigger><SelectContent><SelectItem value="all">All Organisations</SelectItem>{organisations.map(([id, name]) => <SelectItem key={id} value={id}><Logo id={id} alt="" width={16} height={16} className="size-4 object-contain" />{name}</SelectItem>)}</SelectContent></Select>
					<Select value={configuration} onValueChange={setConfiguration}><SelectTrigger aria-label="Filter Progress by Configuration" className="sm:w-44"><SelectValue>{configuration === "all" ? "All Configurations" : configuration}</SelectValue></SelectTrigger><SelectContent><SelectItem value="all">All Configurations</SelectItem>{configurations.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
				</div>
			</div>
			<div className="h-[420px] border-b pb-4">{chart(filteredScatterData)}</div>
			<div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
				<p>Showing {filteredScatterData.length.toLocaleString()} of {scatterData.length.toLocaleString()} Results</p>
				<span className="inline-flex items-center gap-2"><span className="h-0.5 w-5 rounded-full bg-violet-500" />Pareto Frontier</span>
			</div>
		</div>;
	}

	return (
		<Card className="shadow-md">
			<CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-3">
					<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-200">
						<CalendarClock className="h-5 w-5" />
					</div>
					<div>
						<CardTitle className="text-lg font-semibold">
							Scores Over Time
						</CardTitle>
						<p className="text-sm text-muted-foreground">
							Individual benchmark scores plotted by date.
						</p>
					</div>
				</div>
			</CardHeader>
			<CardContent className="h-80 pt-2">
				{scatterData.length > 0 ? chart(scatterData) : (
					<div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-300 text-center text-sm text-muted-foreground dark:border-zinc-700">
						No scores available to display.
					</div>
				)}
			</CardContent>
		</Card>
	);
}
