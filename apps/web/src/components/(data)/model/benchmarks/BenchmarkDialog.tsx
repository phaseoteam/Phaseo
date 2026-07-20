// BenchmarkDialog.tsx
"use client";

import React from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
	ResponsiveContainer,
	BarChart,
	Bar,
	XAxis,
	YAxis,
	Tooltip,
	Cell,
} from "recharts";
import type { RectangleProps } from "recharts";

import { useIsMobile } from "@/hooks/use-mobile";
import type {
	BenchmarkComparisonModel,
	BenchmarkComparisonScoreDetail,
} from "@/lib/fetchers/models/getModelBenchmarkData";

interface BenchmarkDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	benchmarkName: string;
	models: BenchmarkComparisonModel[];
	isLowerBetter: boolean;
	currentScoreDisplay: string | null;
}

interface ChartRow {
	modelId: string;
	modelName: string;
	provider: string;
	score: number;
	scoreDisplay: string;
	isCurrent: boolean;
	colour: string;
	isPercentage: boolean;
	isLowerBetter: boolean;
	details: BenchmarkComparisonScoreDetail[];
}

type BarShapeProps = RectangleProps & {
	payload?: {
		isCurrent?: boolean;
	};
};

function CustomBarShape(props: BarShapeProps) {
	const {
		x = 0,
		y = 0,
		width = 0,
		height = 0,
		fill,
		payload,
	} = props as BarShapeProps;
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
}

function buildRows(
	models: BenchmarkComparisonModel[],
	isLowerBetter: boolean
): ChartRow[] {
	const validModels = models.filter(
		(model): model is BenchmarkComparisonModel & { topScore: number } =>
			typeof model.topScore === "number"
	);

	if (!validModels.length) {
		return [];
	}

	return validModels.map((model) => {
		const originalScore = model.topScore as number;
		const transformedScore = originalScore;

		return {
			modelId: model.modelId,
			modelName: model.modelName,
			provider: model.organisation?.name ?? "Unknown",
			score: transformedScore,
			scoreDisplay: model.topScoreDisplay,
			isCurrent: model.isCurrent,
			colour: model.organisation?.colour ?? "#6366f1",
			isPercentage: model.isPercentage,
			isLowerBetter,
			details: model.scores.map((detail) => ({
				score: detail.score,
				scoreDisplay: detail.scoreDisplay,
				isPercentage: detail.isPercentage,
				otherInfo: detail.otherInfo,
				isSelfReported: detail.isSelfReported,
				sourceLink: detail.sourceLink,
			})),
		};
	});
}

function getDomain(rows: ChartRow[]): [number, number] {
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

function sliceAroundIndex<T>(
	items: T[],
	index: number,
	before = 10,
	after = 10
) {
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

export function BenchmarkDialog({
	open,
	onOpenChange,
	benchmarkName,
	models,
	isLowerBetter,
	currentScoreDisplay,
}: BenchmarkDialogProps) {
	const isMobile = useIsMobile();
	const windowedModels = React.useMemo(() => {
		const currentIndex = models.findIndex((model) => model.isCurrent);
		if (currentIndex === -1) {
			return models.slice(0, Math.min(models.length, 21));
		}
		return sliceAroundIndex(models, currentIndex, 10, 10);
	}, [models]);
	const rows = buildRows(windowedModels, isLowerBetter);
	const domain = getDomain(rows);
	const domainSpan = Math.max(Math.abs(domain[1] - domain[0]), 0);
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
	const axisTickFormatter = React.useCallback(
		(value: number) => formatAxisValue(value),
		[formatAxisValue]
	);
	const chartMargin = React.useMemo(
		() =>
			isMobile
				? { top: 8, right: 16, bottom: 8, left: 0 }
				: { top: 20, right: 30, left: 20, bottom: 40 },
		[isMobile]
	);
	const yAxisWidth = isMobile ? 125 : 160;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="w-[95vw] max-w-5xl overflow-visible">
				<DialogHeader>
					<DialogTitle className="flex flex-wrap items-center gap-2">
						{benchmarkName}
						{currentScoreDisplay && (
							<Badge variant="secondary">
								{currentScoreDisplay}
							</Badge>
						)}
						{isLowerBetter && (
							<Badge
								variant="outline"
								className="text-xs text-blue-600"
							>
								Lower is better
							</Badge>
						)}
					</DialogTitle>
				</DialogHeader>
				<div className="mt-4 h-[500px] w-full overflow-visible">
					{rows.length ? (
						<ResponsiveContainer width="100%" height="100%">
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
									interval={0}
									tick={{
										fontSize: 12,
										fill: "var(--chart-axis-color)",
									}}
									axisLine
								/>
								<XAxis
									type="number"
									domain={domain}
									tickFormatter={axisTickFormatter}
									tick={{
										fill: "var(--chart-axis-color)",
									}}
								/>
								<Tooltip
									wrapperStyle={{ zIndex: 10000 }}
									content={({ active, payload }) => {
										if (
											!active ||
											!payload ||
											!payload.length
										) {
											return null;
										}
										const data = payload[0]
											.payload as ChartRow;
										const sortedDetails = [
											...data.details,
										].sort((a, b) => {
											const aScore =
												typeof a.score === "number"
													? a.score
													: null;
											const bScore =
												typeof b.score === "number"
													? b.score
													: null;
											if (
												aScore === null &&
												bScore === null
											)
												return 0;
											if (aScore === null) return 1;
											if (bScore === null) return -1;
											return data.isLowerBetter
												? aScore - bScore
												: bScore - aScore;
										});
										return (
											<div className="min-w-[220px] rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
												<div className="text-sm font-semibold">
													{data.modelName}
												</div>
												<div className="mb-1 text-xs text-muted-foreground">
													{data.provider}
												</div>
												<div className="font-mono text-base">
													{data.scoreDisplay}
												</div>
												{sortedDetails.length > 1 ? (
													<div className="mt-2 space-y-1 text-xs text-muted-foreground">
														{sortedDetails.map(
															(detail, index) => (
																<div
																	key={`${data.modelId}-${index}`}
																>
																	<span className="font-medium text-foreground">
																		{typeof detail.score ===
																		"number"
																			? `${detail.score.toFixed(
																					2
																			  )}${
																					detail.isPercentage
																						? "%"
																						: ""
																			  }`
																			: detail.scoreDisplay}
																	</span>
																	{detail.otherInfo ? (
																		<span className="ml-1 text-muted-foreground">
																			(
																			{
																				detail.otherInfo
																			}
																			)
																		</span>
																	) : null}
																	{detail.isSelfReported ? (
																		<span className="ml-1 text-amber-600">
																			Self-reported
																		</span>
																	) : null}
																</div>
															)
														)}
													</div>
												) : sortedDetails[0]
														?.otherInfo ? (
													<div className="mt-1 text-[11px] text-muted-foreground">
														{
															sortedDetails[0]
																.otherInfo
														}
													</div>
												) : null}
												{data.isCurrent && (
													<div className="mt-1 text-xs font-semibold text-indigo-600">
														Selected Model
													</div>
												)}
											</div>
										);
									}}
								/>
								<Bar
									dataKey="score"
									isAnimationActive={false}
									barSize={22}
									shape={<CustomBarShape />}
								>
									{rows.map((row) => (
										<Cell
											key={row.modelId}
											fill={row.colour}
										/>
									))}
								</Bar>
							</BarChart>
						</ResponsiveContainer>
					) : (
						<div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
							No numeric benchmark data to display yet.
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
