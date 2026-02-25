"use client";

import React from "react";
import Link from "next/link";
import { Expand } from "lucide-react";
import {
	ResponsiveContainer,
	BarChart,
	Bar,
	LabelList,
	XAxis,
	YAxis,
	Tooltip as RechartsTooltip,
	type TooltipProps,
	Cell,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { BenchmarkDialog } from "@/components/(data)/model/benchmarks/BenchmarkDialog";
import type {
	BenchmarkComparisonChart,
	BenchmarkComparisonModel,
	BenchmarkComparisonScoreDetail,
} from "@/lib/fetchers/models/getModelBenchmarkData";

const MAX_CHART_ROWS = 11;
const MIN_CHART_ROWS = 3;
const ROW_HEIGHT = 34;
const BASE_CHART_MARGIN = { top: 8, right: 20, bottom: 8, left: 40 } as const;

interface ModelBenchmarksComparisonGridProps {
	comparisons: BenchmarkComparisonChart[];
}

interface ChartRow {
	modelId: string;
	modelName: string;
	provider: string;
	score: number;
	scoreDisplay: string;
	isCurrent: boolean;
	isPercentage: boolean;
	isLowerBetter: boolean;
	fill: string;
	rank: number | null;
	details: BenchmarkComparisonScoreDetail[];
}

type RechartsTooltipContentProps = TooltipProps<number, string> & {
	active?: boolean;
	payload?: Array<any>;
	label?: string | number;
};

const PROVIDER_FALLBACK_COLOURS = [
	"#f472b6",
	"#60a5fa",
	"#fb7185",
	"#34d399",
	"#a78bfa",
	"#fbbf24",
	"#6ee7b7",
	"#f97316",
	"#818cf8",
	"#22d3ee",
];

function createColourPalette(models: BenchmarkComparisonModel[]) {
	const map: Record<string, string> = {};
	let fallbackIndex = 0;

	for (const model of models) {
		const provider = model.organisation?.name ?? "Unknown";
		if (map[provider]) continue;

		map[provider] =
			model.organisation?.colour ??
			PROVIDER_FALLBACK_COLOURS[
				fallbackIndex % PROVIDER_FALLBACK_COLOURS.length
			];
		fallbackIndex += 1;
	}

	return map;
}

function buildChartRows(
	models: BenchmarkComparisonModel[],
	palette: Record<string, string>,
	isLowerBetter: boolean
): ChartRow[] {
	const validModels = models.filter(
		(
			model
		): model is BenchmarkComparisonModel & {
			topScore: number;
		} => typeof model.topScore === "number"
	);

	if (!validModels.length) {
		return [];
	}

	return validModels.map((model) => {
		const provider = model.organisation?.name ?? "Unknown";
		const originalScore = model.topScore as number;
		const transformedScore = originalScore;

		return {
			modelId: model.modelId,
			modelName: model.modelName,
			provider,
			score: transformedScore,
			scoreDisplay: model.topScoreDisplay,
			isCurrent: model.isCurrent,
			isPercentage: model.isPercentage,
			isLowerBetter,
			fill: model.organisation?.colour ?? palette[provider] ?? "#6366f1",
			rank: model.rank ?? null,
			details: model.scores,
		};
	});
}

function computeDomain(rows: ChartRow[]): [number, number] {
	if (!rows.length) {
		return [0, 100];
	}

	const scores = rows.map((row) => row.score);
	const minScore = Math.min(...scores);
	const maxScore = Math.max(...scores);
	const allPercentages = rows.every((row) => row.isPercentage);
	const rawRange = maxScore - minScore;
	const effectiveRange =
		rawRange === 0 ? Math.max(Math.abs(maxScore), 1) : rawRange;
	const basePadding = effectiveRange * (allPercentages ? 0.08 : 0.1);
	const minimumPadding = allPercentages ? 0.75 : 0.5;
	const maximumPadding = allPercentages
		? 4
		: Math.max(effectiveRange * 0.25, minimumPadding);
	const padding = Math.min(
		Math.max(basePadding, minimumPadding),
		maximumPadding
	);

	let lower = minScore - padding;
	let upper = maxScore + padding;

	if (allPercentages) {
		if (maxScore <= 100) {
			upper = Math.min(100, Math.max(maxScore, upper));
		}
	}

	if (minScore >= 0) {
		lower = Math.max(0, lower);
	}

	if (lower === upper) {
		const adjustment = allPercentages
			? 1
			: Math.max(1, Math.abs(lower || upper) * 0.05);
		lower -= adjustment;
		upper += adjustment;
	}

	return [
		Number(Math.min(lower, upper).toFixed(2)),
		Number(Math.max(lower, upper).toFixed(2)),
	];
}

const renderBarShape = (props: {
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	fill?: string;
	payload?: {
		isCurrent?: boolean;
	};
}) => {
	const { x = 0, y = 0, width = 0, height = 0, fill, payload } = props;
	const strokeColour = payload?.isCurrent ? "#ef4444" : undefined;
	const rectFill = typeof fill === "string" ? fill : "#6366f1";

	return (
		<g>
			<rect
				x={x}
				y={y}
				width={width}
				height={height}
				fill={rectFill}
				stroke={strokeColour}
				strokeWidth={payload?.isCurrent ? 2 : 0}
				rx={3}
			/>
		</g>
	);
};

function BenchmarkTooltip({
	active,
	payload,
}: RechartsTooltipContentProps) {
	if (!active || !payload || !payload.length) return null;
	const data = payload[0].payload as ChartRow;
	const sortedDetails = [...data.details].sort((a, b) => {
		const aScore = typeof a.score === "number" ? a.score : null;
		const bScore = typeof b.score === "number" ? b.score : null;
		if (aScore === null && bScore === null) return 0;
		if (aScore === null) return 1;
		if (bScore === null) return -1;
		return data.isLowerBetter ? aScore - bScore : bScore - aScore;
	});

	return (
		<div className="min-w-[220px] rounded-lg border border-zinc-200 bg-white p-3 text-sm shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
			<div className="font-semibold">{data.modelName}</div>
			<div className="mb-1 text-xs text-muted-foreground">
				{data.provider}
			</div>
			<div className="font-mono text-base">{data.scoreDisplay}</div>
			{sortedDetails.length > 1 ? (
				<div className="mt-2 space-y-1 text-xs text-muted-foreground">
					{sortedDetails.map((detail, index) => (
						<div key={`${data.modelId}-${index}`}>
							<span className="font-medium text-foreground">
								{typeof detail.score === "number"
									? `${detail.score.toFixed(2)}${
											detail.isPercentage ? "%" : ""
									  }`
									: detail.scoreDisplay}
							</span>
							{detail.otherInfo ? (
								<span className="ml-1 text-muted-foreground">
									({detail.otherInfo})
								</span>
							) : null}
							{detail.isSelfReported ? (
								<span className="ml-1 text-amber-500">
									Self-reported
								</span>
							) : null}
						</div>
					))}
				</div>
			) : sortedDetails[0]?.otherInfo ? (
				<div className="mt-1 text-[11px] text-muted-foreground">
					{sortedDetails[0].otherInfo}
				</div>
			) : null}
			{data.isCurrent && (
				<div className="mt-1 text-xs font-semibold text-indigo-600">
					Selected model
				</div>
			)}
		</div>
	);
}

function sliceAroundIndex<T>(items: T[], index: number, before = 5, after = 5) {
	if (items.length <= before + after + 1) return items;

	if (index < 0) {
		return items.slice(0, before + after + 1);
	}

	let start = Math.max(0, index - before);
	let end = Math.min(items.length, index + after + 1);

	const desired = before + after + 1;
	if (end - start < desired) {
		const deficit = desired - (end - start);
		start = Math.max(0, start - deficit);
		end = Math.min(items.length, start + desired);
	}

	return items.slice(start, end);
}

export function ModelBenchmarksComparisonGrid({
	comparisons,
}: ModelBenchmarksComparisonGridProps) {
	const isMobile = useIsMobile();
	const [selectedBenchmarkId, setSelectedBenchmarkId] = React.useState<
		string | null
	>(() => comparisons[0]?.benchmarkId ?? null);
	const [dialogOpen, setDialogOpen] = React.useState(false);

	React.useEffect(() => {
		if (!comparisons.length) return;

		if (
			!selectedBenchmarkId ||
			!comparisons.some(
				(comparison) => comparison.benchmarkId === selectedBenchmarkId
			)
		) {
			setSelectedBenchmarkId(comparisons[0].benchmarkId);
		}
	}, [comparisons, selectedBenchmarkId]);

	const selectedComparison = React.useMemo(() => {
		if (!comparisons.length) {
			return null;
		}

		if (selectedBenchmarkId) {
			const match = comparisons.find(
				(comparison) => comparison.benchmarkId === selectedBenchmarkId
			);
			if (match) {
				return match;
			}
		}

		return comparisons[0];
	}, [comparisons, selectedBenchmarkId]);

	if (!selectedComparison) {
		return null;
	}

	const topModels = React.useMemo(
		() => selectedComparison.models.slice(0, 20),
		[selectedComparison]
	);
	const allModels = React.useMemo(
		() => selectedComparison.models,
		[selectedComparison]
	);
	const palette = React.useMemo(
		() => createColourPalette(allModels),
		[allModels]
	);
	const chartModels = React.useMemo(() => {
		const currentIndex = allModels.findIndex((model) => model.isCurrent);
		if (currentIndex === -1) {
			// Fallback to top models if current model not found
			return topModels.slice(0, MAX_CHART_ROWS);
		}
		return sliceAroundIndex(allModels, currentIndex, 5, 5);
	}, [allModels, topModels]);
	const rows = React.useMemo(
		() =>
			buildChartRows(
				chartModels,
				palette,
				selectedComparison.isLowerBetter
			),
		[chartModels, palette, selectedComparison.isLowerBetter]
	);

	const visibleRows = Math.min(MAX_CHART_ROWS, rows.length);
	const domain = React.useMemo(() => computeDomain(rows), [rows]);
	const domainSpan = Math.max(Math.abs(domain[1] - domain[0]), 0);
	const chartRowCount = Math.max(visibleRows, MIN_CHART_ROWS);
	const chartHeight = chartRowCount * ROW_HEIGHT;
	const barSize = Math.max(18, Math.min(24, Math.round(ROW_HEIGHT * 0.6)));
	const hasRows = rows.length > 0;
	const isLowerBetter = selectedComparison.isLowerBetter;
	const chartMargin = React.useMemo(
		() =>
			isMobile
				? { top: 8, right: 16, bottom: 8, left: 0 }
				: BASE_CHART_MARGIN,
		[isMobile]
	);
	const yAxisWidth = isMobile ? 125 : 180;
	const formatAxisValue = React.useCallback(
		(value: number) => {
			if (!Number.isFinite(value)) {
				return "0";
			}
			if (domainSpan <= 1) {
				return value.toFixed(2);
			}
			if (domainSpan <= 10) {
				return value.toFixed(1);
			}
			return Math.round(value).toString();
		},
		[domainSpan]
	);
	const xAxisTickFormatter = React.useCallback(
		(value: number) => formatAxisValue(value),
		[formatAxisValue]
	);

	const currentModel =
		selectedComparison.models.find((model) => model.isCurrent) ?? null;
	const currentScoreDisplay =
		currentModel?.topScoreDisplay ??
		selectedComparison.current.scoreDisplay ??
		null;
	const currentRank =
		currentModel?.rank ?? selectedComparison.current.rank ?? null;
	const totalModels = selectedComparison.totalModels ?? null;

	return (
		<div className="space-y-4">
			<Card className="flex flex-col gap-5 rounded-lg border border-gray-200 border-b-2 border-b-gray-300 bg-white p-5 dark:border-gray-700 dark:border-b-gray-600">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
					<div className="flex flex-col gap-1">
						<h4 className="text-lg font-semibold">
							{selectedComparison.benchmarkName}
						</h4>
						<p className="text-sm text-muted-foreground">
							Compare this model with the leading peers for the
							selected benchmark.
						</p>
					</div>
					<div className="flex w-full flex-col gap-2 sm:w-72">
						<span className="text-xs font-semibold uppercase text-muted-foreground">
							Benchmark
						</span>
						<Select
							value={selectedComparison.benchmarkId}
							onValueChange={(value) =>
								setSelectedBenchmarkId(value)
							}
						>
							<SelectTrigger aria-label="Select benchmark">
								<SelectValue placeholder="Select benchmark" />
							</SelectTrigger>
							<SelectContent>
								{[...comparisons]
									.sort((a, b) =>
										a.benchmarkName.localeCompare(
											b.benchmarkName
										)
									)
									.map((comparison) => (
										<SelectItem
											key={comparison.benchmarkId}
											value={comparison.benchmarkId}
											className="py-2"
										>
											<span className="flex flex-col gap-0.5">
												<span className="font-medium">
													{comparison.benchmarkName}
												</span>
												<span className="text-xs text-muted-foreground text-left">
													{comparison.current
														.scoreDisplay ??
														"No score recorded yet"}
												</span>
											</span>
										</SelectItem>
									))}
							</SelectContent>
						</Select>
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					{currentScoreDisplay ? (
						<Badge variant="secondary">{currentScoreDisplay}</Badge>
					) : null}
					{currentRank != null ? (
						<Badge variant="outline">
							Rank #{currentRank}
							{totalModels != null ? `/${totalModels}` : ""}
						</Badge>
					) : null}
					{totalModels != null ? (
						<Badge variant="secondary">{totalModels} models</Badge>
					) : null}
					{isLowerBetter ? (
						<Badge
							variant="outline"
							className="text-xs text-blue-600"
						>
							Lower is better
						</Badge>
					) : null}
				</div>

				{isLowerBetter ? (
					<p className="text-xs text-muted-foreground">
						Lower scores indicate stronger performance.
					</p>
				) : null}

				<div
					className="flex w-full flex-1 items-stretch"
					style={{ minHeight: chartHeight }}
				>
					<div className="min-w-0 flex-1">
						{hasRows ? (
							<ResponsiveContainer
								width="100%"
								height={chartHeight}
							>
								<BarChart
									data={rows}
									layout="vertical"
									margin={chartMargin}
									barCategoryGap="24%"
								>
									<YAxis
										type="category"
										dataKey="modelName"
										width={yAxisWidth}
										axisLine
										tick={{
											fontSize: 12,
											fill: "var(--chart-axis-color)",
										}}
									/>
									<XAxis
										type="number"
										domain={domain}
										tickFormatter={xAxisTickFormatter}
										tick={{
											fill: "var(--chart-axis-color)",
										}}
									/>
									<RechartsTooltip
										cursor={{ fill: "rgba(0,0,0,0.05)" }}
										content={<BenchmarkTooltip />}
									/>
									<Bar
										dataKey="score"
										isAnimationActive={false}
										barSize={barSize}
										shape={renderBarShape}
									>
										<LabelList
											dataKey="scoreDisplay"
											position="right"
											offset={10}
											className="fill-zinc-700 text-xs font-medium dark:fill-zinc-300"
										/>
										{rows.map((entry) => (
											<Cell
												key={entry.modelId}
												fill={entry.fill}
											/>
										))}
									</Bar>
								</BarChart>
							</ResponsiveContainer>
						) : (
							<div className="flex h-full items-center justify-center rounded-md border border-dashed border-zinc-300 px-4 text-sm text-muted-foreground dark:border-zinc-700">
								No numeric benchmark data available yet for this
								selection.
							</div>
						)}
					</div>
				</div>

				<div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
					<span>
						{hasRows
							? `Showing ${
									rows.length
							  } models around the selected model${
									totalModels != null
										? ` (out of ${totalModels} total)`
										: ""
							  }.`
							: "Charts will appear once comparable scores are available."}
					</span>
					<div className="flex items-center gap-2">
						<Button
							asChild
							variant="ghost"
							size="sm"
							className="text-xs font-medium"
						>
							<Link
								href={`/benchmarks/${selectedComparison.benchmarkId}`}
							>
								View benchmark page
							</Link>
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => setDialogOpen(true)}
							className="gap-1.5"
						>
							<Expand className="h-4 w-4" />
							<span>Full ranking</span>
						</Button>
					</div>
				</div>
			</Card>

			<BenchmarkDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				benchmarkName={selectedComparison.benchmarkName}
				models={allModels}
				isLowerBetter={isLowerBetter}
				currentRank={currentRank}
				totalModels={totalModels}
				currentScoreDisplay={currentScoreDisplay}
			/>
		</div>
	);
}
