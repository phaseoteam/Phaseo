"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Hash, Percent, Star } from "lucide-react";
import Link from "next/link";
import type { ExtendedModel } from "@/data/types";
import BenchmarkBarChart, { BENCHMARK_SERIES_COLORS } from "./BenchmarkBarChart";
import { normalizeBenchmarkScoreType } from "@/lib/benchmarks/scoreFormat";
import { ProviderLogo } from "../../ProviderLogo";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";

const DEFAULT_VISIBLE_BENCHMARKS = 4;

type BenchmarkScoreType = "percent" | "numeric";

type ParsedScore = {
	numeric: number;
	isPercent: boolean;
};

type ComparableBenchmark = {
	name: string;
	benchmarkId: string | null;
	lowerIsBetter: boolean;
	scoreType: BenchmarkScoreType;
	scoresByModelId: Record<string, number>;
};

function parseScore(value: string | number): ParsedScore | null {
	if (typeof value === "number") {
		if (!Number.isFinite(value)) return null;
		return { numeric: value, isPercent: false };
	}
	const normalized = value.replace(/,/g, "").trim();
	if (!normalized) return null;
	const isPercent = normalized.endsWith("%");
	const parsed = Number.parseFloat(normalized.replace("%", ""));
	if (!Number.isFinite(parsed)) return null;
	return { numeric: parsed, isPercent };
}

function getLowerIsBetter(orderValue: string | null | undefined): boolean {
	const normalizedOrder = String(orderValue ?? "").toLowerCase();
	return (
		normalizedOrder === "ascending" ||
		normalizedOrder.includes("ascending") ||
		normalizedOrder.includes("lower")
	);
}

function getSharedBenchmarkNames(selectedModels: ExtendedModel[]): string[] {
	if (!selectedModels?.length) return [];

	const firstModelBenchmarks = new Set(
		(selectedModels[0].benchmark_results ?? [])
			.map((result) => result.benchmark.name)
			.filter(Boolean)
	);

	for (let index = 1; index < selectedModels.length; index += 1) {
		const names = new Set(
			(selectedModels[index].benchmark_results ?? [])
				.map((result) => result.benchmark.name)
				.filter(Boolean)
		);
		for (const name of Array.from(firstModelBenchmarks)) {
			if (!names.has(name)) firstModelBenchmarks.delete(name);
		}
	}

	return Array.from(firstModelBenchmarks).sort((a, b) => a.localeCompare(b));
}

function detectScoreType(
	benchmarkType: unknown,
	benchmarkName: string,
	category: string | null,
	scores: ParsedScore[]
): BenchmarkScoreType {
	const normalizedType = normalizeBenchmarkScoreType(benchmarkType);
	if (normalizedType) {
		return normalizedType === "percentage" ? "percent" : "numeric";
	}

	if (scores.some((score) => score.isPercent)) return "percent";

	const info = `${benchmarkName} ${category ?? ""}`.toLowerCase();
	const percentKeywords = [
		"%",
		"percent",
		"accuracy",
		"acc",
		"precision",
		"recall",
		"f1",
		"pass@",
		"win rate",
		"winrate",
	];
	const infoSuggestsPercent = percentKeywords.some((keyword) => info.includes(keyword));
	if (infoSuggestsPercent) return "percent";

	return "numeric";
}

function normalizeValueForType(
	parsed: ParsedScore,
	scoreType: BenchmarkScoreType
): number {
	if (scoreType === "percent") {
		if (parsed.isPercent) return parsed.numeric;
		if (parsed.numeric >= 0 && parsed.numeric <= 1) return parsed.numeric * 100;
		return parsed.numeric;
	}
	return parsed.numeric;
}

function buildComparableBenchmarks(
	selectedModels: ExtendedModel[]
): ComparableBenchmark[] {
	const sharedBenchmarkNames = getSharedBenchmarkNames(selectedModels);
	if (!sharedBenchmarkNames.length) return [];

	const results: ComparableBenchmark[] = [];

	for (const benchmarkName of sharedBenchmarkNames) {
		const benchmarkMatchesPerModel = selectedModels.map((model) =>
			(model.benchmark_results ?? []).filter(
				(result) => result.benchmark.name === benchmarkName
			)
		);

		if (benchmarkMatchesPerModel.some((matches) => matches.length === 0)) continue;

		const firstMatch = benchmarkMatchesPerModel[0][0];
		const lowerIsBetter = getLowerIsBetter(firstMatch?.benchmark.order);
		const benchmarkId = firstMatch?.benchmark.id ?? null;
		const category = firstMatch?.benchmark.category ?? null;
		const benchmarkType = firstMatch?.benchmark.type ?? null;

		const allParsed = benchmarkMatchesPerModel
			.flat()
			.map((match) => parseScore(match.score))
			.filter((value): value is ParsedScore => value !== null);

		if (!allParsed.length) continue;

		const scoreType = detectScoreType(
			benchmarkType,
			benchmarkName,
			category,
			allParsed
		);
		const scoresByModelId: Record<string, number> = {};
		let allModelsHaveComparableScore = true;

		for (let index = 0; index < selectedModels.length; index += 1) {
			const model = selectedModels[index];
			const parsedValues = benchmarkMatchesPerModel[index]
				.map((match) => parseScore(match.score))
				.filter((value): value is ParsedScore => value !== null)
				.map((parsed) => normalizeValueForType(parsed, scoreType));

			if (!parsedValues.length) {
				allModelsHaveComparableScore = false;
				break;
			}

			const bestValue = lowerIsBetter
				? Math.min(...parsedValues)
				: Math.max(...parsedValues);
			scoresByModelId[model.id] = bestValue;
		}

		if (!allModelsHaveComparableScore) continue;

		results.push({
			name: benchmarkName,
			benchmarkId,
			lowerIsBetter,
			scoreType,
			scoresByModelId,
		});
	}

	return results;
}

function formatScoreValue(
	value: number | null | undefined,
	scoreType: BenchmarkScoreType
): string {
	if (value == null || !Number.isFinite(value)) return "-";
	if (scoreType === "percent") {
		return `${value.toLocaleString("en-US", {
			minimumFractionDigits: value < 10 ? 1 : 0,
			maximumFractionDigits: 2,
		})}%`;
	}
	return value.toLocaleString("en-US", {
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
	});
}

function scoreTypeLabel(scoreType: BenchmarkScoreType): string {
	return scoreType === "percent" ? "%" : "Numerical";
}

function toChartData(
	selectedModels: ExtendedModel[],
	benchmarks: ComparableBenchmark[]
) {
	return benchmarks.map((benchmark) => {
		const row: { [key: string]: string | number | null } = {
			benchmark: benchmark.name,
			scoreType: benchmark.scoreType,
		};
		for (const model of selectedModels) {
			row[model.name] = benchmark.scoresByModelId[model.id] ?? null;
		}
		return row;
	});
}

function CustomTooltip({
	active,
	payload,
	label,
	metaByName,
}: {
	active?: boolean;
	payload?: Array<{ name: string; value: number | null }>;
	label?: string;
	metaByName: Record<string, ComparableBenchmark>;
}) {
	if (!active || !payload || !payload.length || !label) return null;
	const benchmarkMeta = metaByName[label];
	const scoreType = benchmarkMeta?.scoreType ?? "numeric";
	return (
		<div className="rounded-lg border border-border bg-background px-3 py-2 shadow-md min-w-[180px]">
			<div className="mb-1 flex items-center justify-between gap-2">
				<div className="text-sm font-semibold">{label}</div>
				<Badge variant="outline" className="text-[10px]">
					{scoreTypeLabel(scoreType)}
				</Badge>
			</div>
			{payload.map((item) => (
				<div key={item.name} className="flex items-center justify-between gap-3 text-xs">
					<span>{item.name}</span>
					<span className="font-mono">
						{formatScoreValue(item.value, scoreType)}
					</span>
				</div>
			))}
		</div>
	);
}

export default function PerformanceBenchmarkGraph({
	selectedModels,
}: {
	selectedModels: ExtendedModel[];
}) {
	const [expanded, setExpanded] = React.useState(false);
	const [selectedScoreType, setSelectedScoreType] =
		React.useState<BenchmarkScoreType>("percent");

	const comparableBenchmarks = React.useMemo(
		() => buildComparableBenchmarks(selectedModels),
		[selectedModels]
	);
	if (!comparableBenchmarks.length) return null;

	const availableScoreTypes = React.useMemo(() => {
		const types = new Set<BenchmarkScoreType>();
		for (const benchmark of comparableBenchmarks) {
			types.add(benchmark.scoreType);
		}
		return Array.from(types);
	}, [comparableBenchmarks]);

	React.useEffect(() => {
		if (!availableScoreTypes.includes(selectedScoreType)) {
			setSelectedScoreType(availableScoreTypes[0] ?? "percent");
			setExpanded(false);
		}
	}, [availableScoreTypes, selectedScoreType]);

	const activeBenchmarks = React.useMemo(
		() =>
			comparableBenchmarks.filter(
				(benchmark) => benchmark.scoreType === selectedScoreType
			),
		[comparableBenchmarks, selectedScoreType]
	);
	if (!activeBenchmarks.length) return null;

	const chartData = React.useMemo(
		() => toChartData(selectedModels, activeBenchmarks),
		[selectedModels, activeBenchmarks]
	);
	const benchmarkMetaByName = React.useMemo(() => {
		const map: Record<string, ComparableBenchmark> = {};
		for (const benchmark of activeBenchmarks) {
			map[benchmark.name] = benchmark;
		}
		return map;
	}, [activeBenchmarks]);

	const hiddenCount = Math.max(0, activeBenchmarks.length - DEFAULT_VISIBLE_BENCHMARKS);
	const visibleBenchmarks = expanded
		? activeBenchmarks
		: activeBenchmarks.slice(0, DEFAULT_VISIBLE_BENCHMARKS);

	return (
		<section className="space-y-3">
			<header className="flex items-start justify-between gap-4">
				<div className="space-y-1">
					<h2 className="text-lg font-semibold">Benchmarks Comparison</h2>
					<p className="text-sm text-muted-foreground">
						Only benchmarks with comparable results across every selected model are shown.
					</p>
				</div>
			</header>

			<Card className="border-border/60 bg-background/60">
				<CardHeader className="pb-2">
					<div className="flex items-start justify-between gap-3">
						<div>
							<CardTitle className="text-sm font-semibold">
								Benchmark Scores ({scoreTypeLabel(selectedScoreType)})
							</CardTitle>
							<p className="text-xs text-muted-foreground mt-1">
								Switch benchmark type to compare percent and numerical families separately.
							</p>
						</div>
						{availableScoreTypes.length > 1 ? (
							<div className="inline-flex items-center gap-1 rounded-md border border-border/60 p-1">
								<TooltipProvider delayDuration={120}>
									<Tooltip>
										<TooltipTrigger asChild>
											<Button
												type="button"
												size="icon"
												variant={selectedScoreType === "percent" ? "default" : "outline"}
												onClick={() => {
													setSelectedScoreType("percent");
													setExpanded(false);
												}}
												className="h-7 w-7"
												aria-label="Percentage benchmarks"
												aria-pressed={selectedScoreType === "percent"}
											>
												<Percent className="h-4 w-4" />
											</Button>
										</TooltipTrigger>
										<TooltipContent>Percentage benchmarks</TooltipContent>
									</Tooltip>
									<Tooltip>
										<TooltipTrigger asChild>
											<Button
												type="button"
												size="icon"
												variant={selectedScoreType === "numeric" ? "default" : "outline"}
												onClick={() => {
													setSelectedScoreType("numeric");
													setExpanded(false);
												}}
												className="h-7 w-7"
												aria-label="Numerical benchmarks"
												aria-pressed={selectedScoreType === "numeric"}
											>
												<Hash className="h-4 w-4" />
											</Button>
										</TooltipTrigger>
										<TooltipContent>Numerical benchmarks</TooltipContent>
									</Tooltip>
								</TooltipProvider>
							</div>
						) : null}
					</div>
				</CardHeader>
				<CardContent className="p-4">
					<div className="mb-3 flex flex-wrap items-center gap-2">
						{selectedModels.map((model, index) => (
							<Link
								key={`benchmark-legend-${model.id}`}
								href={`/models/${model.id}`}
								className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] text-foreground transition-colors hover:bg-muted/40"
							>
								<span
									className="h-2.5 w-2.5 shrink-0 rounded-full"
									style={{
										backgroundColor:
											BENCHMARK_SERIES_COLORS[
												index % BENCHMARK_SERIES_COLORS.length
											],
									}}
									aria-hidden="true"
								/>
								<ProviderLogo
									id={model.provider.provider_id}
									alt={model.provider.name}
									size="xxs"
									className="shrink-0"
								/>
								<span className="max-w-[180px] truncate">{model.name}</span>
							</Link>
						))}
					</div>
					<BenchmarkBarChart
						chartData={chartData}
						models={selectedModels.map((model) => ({ name: model.name }))}
						allPercent={selectedScoreType === "percent"}
						CustomTooltip={(props: any) => (
							<CustomTooltip {...props} metaByName={benchmarkMetaByName} />
						)}
					/>
				</CardContent>
			</Card>

			<div className="grid gap-3 md:grid-cols-2">
				{visibleBenchmarks.map((benchmark) => {
					const values = selectedModels.map((model) => ({
						modelId: model.id,
						modelName: model.name,
						providerId: model.provider.provider_id,
						providerName: model.provider.name,
						value: benchmark.scoresByModelId[model.id] ?? null,
					}));
					const validValues = values
						.map((entry) => entry.value)
						.filter((value): value is number => value !== null && Number.isFinite(value));
					const bestValue =
						validValues.length > 0
							? benchmark.lowerIsBetter
								? Math.min(...validValues)
								: Math.max(...validValues)
							: null;

					return (
						<Card key={benchmark.name} className="border-border/60 bg-card shadow-sm">
							<CardContent className="p-3 space-y-2">
								<div className="flex items-center justify-between gap-2">
									{benchmark.benchmarkId ? (
										<Link
											href={`/benchmarks/${encodeURIComponent(benchmark.benchmarkId)}`}
											className="text-sm font-semibold underline decoration-transparent hover:decoration-current"
										>
											{benchmark.name}
										</Link>
									) : (
										<div className="text-sm font-semibold">{benchmark.name}</div>
									)}
									<div className="inline-flex items-center gap-1.5">
										<Badge variant="outline" className="text-[10px]">
											{scoreTypeLabel(benchmark.scoreType)}
										</Badge>
										<Badge variant="secondary" className="text-[10px]">
											{benchmark.lowerIsBetter ? "Lower is better" : "Higher is better"}
										</Badge>
									</div>
								</div>

								<div className="space-y-1.5">
									{values.map((entry) => {
										const value = entry.value;
										const relativePercent =
											value != null &&
											bestValue != null &&
											Number.isFinite(value) &&
											(benchmark.scoreType === "percent"
												? Math.max(0, Math.min(100, value))
												: benchmark.lowerIsBetter && value > 0 && bestValue > 0
													? (bestValue / value) * 100
													: !benchmark.lowerIsBetter && bestValue > 0
														? (value / bestValue) * 100
														: 0);
										const isBest =
											value != null &&
											bestValue != null &&
											Number.isFinite(value) &&
											value === bestValue;

										return (
											<div key={`${benchmark.name}-${entry.modelId}`} className="space-y-1">
												<div className="flex items-center justify-between gap-2 text-xs">
													<span className="inline-flex min-w-0 items-center gap-1.5">
														<ProviderLogo
															id={entry.providerId}
															alt={entry.providerName}
															size="xxs"
															className="shrink-0"
														/>
														<Link
															href={`/models/${entry.modelId}`}
															className="truncate text-muted-foreground underline decoration-transparent hover:decoration-current"
														>
															{entry.modelName}
														</Link>
														{isBest ? (
															<Star className="h-3.5 w-3.5 shrink-0 text-emerald-600 fill-emerald-500" />
														) : null}
													</span>
													<span className="min-w-[70px] text-right font-mono tabular-nums">
														{formatScoreValue(value, benchmark.scoreType)}
													</span>
												</div>
												<div className="h-2 rounded bg-muted/60 overflow-hidden">
													<div
														className="h-full bg-sky-500/80 rounded"
														style={{
															width: `${
																value != null && Number.isFinite(value)
																	? Math.max(6, Math.min(100, Math.round(relativePercent || 0)))
																	: 0
															}%`,
														}}
													/>
												</div>
											</div>
										);
									})}
								</div>
							</CardContent>
						</Card>
					);
				})}
			</div>

			{hiddenCount > 0 ? (
				<div className="flex justify-center">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-7 text-xs"
						onClick={() => setExpanded((current) => !current)}
					>
						{expanded ? "Show Less" : `Show More (${hiddenCount})`}
					</Button>
				</div>
			) : null}
		</section>
	);
}
