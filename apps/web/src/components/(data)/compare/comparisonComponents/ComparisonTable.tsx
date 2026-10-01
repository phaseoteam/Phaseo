"use client";

import React from "react";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import { ExtendedModel } from "@/data/types";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Check, Star, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ProviderLogo } from "../ProviderLogo";
import { useLocale, useTranslations } from "next-intl";
import {
	getLowerIsBetter,
	normalizeBenchmarkScoreValue,
	parseBenchmarkScore,
	resolveBenchmarkIsPercentage,
} from "@/lib/benchmarks/scoreFormat";

interface ComparisonTableProps {
	selectedModels: ExtendedModel[];
}

function translateModelStatus(
	status: string,
	t: ReturnType<typeof useTranslations<"Catalogue.compare">>
): string {
	const keyByStatus: Record<string, Parameters<typeof t>[0]> = {
		available: "statusAvailable",
		preview: "statusPreview",
		deprecated: "statusDeprecated",
		retired: "statusRetired",
		announced: "statusAnnounced",
		rumoured: "statusRumoured",
		limited_access: "statusLimitedAccess",
		withheld: "statusWithheld",
	};
	const key = keyByStatus[status.trim().toLowerCase().replace(/[ -]+/g, "_")];
	return key ? t(key) : status;
}

function formatCurrency(value: number, locale: string): string {
	return new Intl.NumberFormat(locale, {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(value);
}

function formatScaledCount(value: number, divisor: number, suffix: string, locale: string) {
	return `${(value / divisor).toLocaleString(locale, { maximumFractionDigits: 1 })}${suffix}`;
}

function renderBool(
	value: boolean | null | undefined,
	t: ReturnType<typeof useTranslations<"Catalogue.compare">>
) {
	if (value === true) return <Check aria-label={t("yes")} className="mx-auto h-4 w-4 text-emerald-600" />;
	if (value === false) return <X aria-label={t("no")} className="mx-auto h-4 w-4 text-muted-foreground" />;
	return <span className="block text-center text-xs text-muted-foreground">-</span>;
}

function formatLicenseLabel(
	value: string | null | undefined,
	t: ReturnType<typeof useTranslations<"Catalogue.compare">>
): string {
	const raw = typeof value === "string" ? value.trim() : "";
	if (!raw) return "-";
	const lower = raw.toLowerCase();
	if (lower === "unknown" || lower === "n/a" || lower === "na" || lower === "tbd")
		return t("unknown");
	return raw;
}

function toTypeList(value: ExtendedModel["input_types"]): string[] {
	if (!value) return [];
	if (Array.isArray(value)) return value.filter(Boolean);
	return String(value)
		.split(",")
		.map((v) => v.trim())
		.filter(Boolean);
}

function normalizeTypeLabel(
	value: string,
	t: ReturnType<typeof useTranslations<"Catalogue.compare">>
): string {
	const v = value.trim().toLowerCase();
	if (v === "text") return t("modalityText");
	if (v === "image") return t("modalityImage");
	if (v === "audio_stt") return t("modalityTranscription");
	if (v === "audio_tts") return t("modalitySpeech");
	if (v === "audio_music") return t("modalityMusic");
	if (v === "audio") return t("modalityAudio");
	if (v === "video") return t("modalityVideo");
	if (v === "embedding" || v === "embeddings") return t("modalityEmbeddings");
	return value;
}

function formatTypes(
	value: ExtendedModel["input_types"],
	t: ReturnType<typeof useTranslations<"Catalogue.compare">>
): string {
	const list = toTypeList(value).map((type) => normalizeTypeLabel(type, t));
	return list.length ? Array.from(new Set(list)).join(", ") : "-";
}

// Helper functions to get prices
function getModelPrices(model: ExtendedModel) {
	if (!model.prices || model.prices.length === 0) return null;
	// For now, just use the first pricing entry
	// TODO: Allow selecting specific API provider pricing if multiple exist
	return model.prices[0];
}

function getInputPrice(model: ExtendedModel): number | null {
	const prices = getModelPrices(model);
	return prices?.input_token_price ?? null;
}

function getOutputPrice(model: ExtendedModel): number | null {
	const prices = getModelPrices(model);
	return prices?.output_token_price ?? null;
}

function getLatency(model: ExtendedModel): number | string | null {
	const prices = getModelPrices(model);
	const latency = prices?.latency;
	if (latency === null || latency === undefined || latency === "")
		return null;
	return typeof latency === "string" ? parseFloat(latency) : latency;
}

function getThroughput(model: ExtendedModel): number | null {
	const prices = getModelPrices(model);
	const throughput = prices?.throughput;
	if (throughput === null || throughput === undefined || throughput === "")
		return null;
	return typeof throughput === "string" ? parseFloat(throughput) : throughput;
}

// Helper to map benchmark names to ids
function getBenchmarkNameToIdMap(
	selectedModels: ExtendedModel[]
): Record<string, string> {
	const map: Record<string, string> = {};
	selectedModels.forEach((model) => {
		(model.benchmark_results || []).forEach((b) => {
			if (b.benchmark && b.benchmark.name && b.benchmark.id) {
				map[b.benchmark.name] = b.benchmark.id;
			}
		});
	});
	return map;
}

export default function ComparisonTable({
	selectedModels,
}: ComparisonTableProps) {
	const t = useTranslations("Catalogue.compare");
	const locale = useLocale();
	const format = useDisplayFormatters();
	const formatMonthYear = (value: string | null | undefined) => format.calendarDate(value);
	if (!selectedModels || selectedModels.length === 0) return null;

	// Get all unique benchmark names across all models
	const allBenchmarks = Array.from(
		new Set(
			selectedModels.flatMap(
				(model) =>
					model.benchmark_results?.map((b) => b.benchmark.name) || []
			)
		)
	).sort();

	const benchmarkNameToId = getBenchmarkNameToIdMap(selectedModels);

	// Helper function to find the best (lowest) price
	const findBestPrice = (metric: "input" | "output") => {
		const prices = selectedModels
			.map((model) =>
				metric === "input"
					? getInputPrice(model)
					: getOutputPrice(model)
			)
			.filter((price) => price !== null) as number[];
		return prices.length > 0 ? Math.min(...prices) : null;
	};

	// Helper function to find the best latency and throughput
	const findBestMetric = (metric: "latency" | "throughput") => {
		const values = selectedModels
			.map((model) =>
				metric === "latency" ? getLatency(model) : getThroughput(model)
			)
			.filter((value) => value !== null) as number[];
		return values.length > 0
			? metric === "latency"
				? Math.min(...values)
				: Math.max(...values)
			: null;
	};

	// Get best values
	const bestInputPrice = findBestPrice("input");
	const bestOutputPrice = findBestPrice("output");
	const bestLatency = findBestMetric("latency");
	const bestThroughput = findBestMetric("throughput");

	return (
		<section className="space-y-3">
			<header className="space-y-1">
				<h2 className="text-lg font-semibold">{t("details")}</h2>
				<p className="text-sm text-muted-foreground">
					{t("detailsDescription")}
				</p>
			</header>

			{/* Desktop Table View */}
			<div className="hidden md:block">
				<Card className="w-full border-border/60 bg-card shadow-sm">
					<CardContent className="max-h-[800px] overflow-auto relative p-0">
						<Table className="table-fixed relative">
							<TableHeader className="sticky top-0 bg-white dark:bg-zinc-950 z-20 shadow-sm">
								<TableRow>
									<TableHead className="w-[200px] bg-white dark:bg-zinc-950 sticky left-0 z-30 h-auto py-3" />
									{selectedModels.map((model) => (
										<TableHead
											key={model.id}
											className="text-center bg-white dark:bg-zinc-950 h-auto py-3 align-bottom"
											style={{
												width: `calc((100% - 200px) / ${selectedModels.length})`,
											}}
										>
											<div className="flex items-center gap-3 justify-center">
												<Link
													href={`/organisations/${model.provider.provider_id}`}
													className="focus:outline-none"
												>
													<ProviderLogo
														id={model.provider.provider_id}
														alt={model.provider.name}
														size="sm"
													/>
												</Link>
												<div className="flex flex-col items-start">
													<Link
														href={`/models/${model.id}`}
														className="group"
													>
														<span className="relative underline decoration-transparent group-hover:decoration-current transition-colors duration-200 font-medium">
															{model.name}
														</span>
													</Link>
													<Link
														href={`/organisations/${model.provider.provider_id}`}
														className="group text-xs text-muted-foreground"
													>
														<span className="relative underline decoration-transparent group-hover:decoration-current transition-colors duration-200">
															{
																model.provider
																	.name
															}
														</span>
													</Link>
												</div>
											</div>
										</TableHead>
									))}
								</TableRow>
							</TableHeader>
							<TableBody>
								{/* General Info Section */}
								<TableRow className="bg-zinc-100/50 dark:bg-zinc-800/50">
									<TableCell
										colSpan={selectedModels.length + 1}
										className="font-semibold sticky left-0 bg-zinc-100/50 dark:bg-zinc-800/50 z-10"
									>
										{t("generalInformation")}
									</TableCell>
								</TableRow>

								{/* Context Window */}
								<TableRow>
									<TableCell className="font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10">
										{t("contextWindow")}
									</TableCell>
									{selectedModels.map((model) => (
										<TableCell
											key={model.id}
											className="text-center"
										>
											{t("input")}: {" "}
											{model.input_context_length != null ? format.number(model.input_context_length) :
												"-"}
											<br />
											{t("output")}: {" "}
											{model.output_context_length != null ? format.number(model.output_context_length) :
												"-"}
										</TableCell>
									))}
								</TableRow>

								{/* Modalities */}
								<TableRow>
									<TableCell className="font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10">
										{t("modalities")}
									</TableCell>
									{selectedModels.map((model) => (
										<TableCell key={model.id} className="text-center">
											<div className="text-xs">
												<div>
													<span className="text-muted-foreground">{t("input")}:</span>{" "}
													{formatTypes(model.input_types, t)}
												</div>
												<div className="mt-1">
													<span className="text-muted-foreground">{t("output")}:</span>{" "}
													{formatTypes(model.output_types, t)}
												</div>
											</div>
										</TableCell>
									))}
								</TableRow>

								{/* Reasoning */}
								<TableRow>
									<TableCell className="font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10">
										{t("reasoningCapability")}
									</TableCell>
									{selectedModels.map((model) => (
										<TableCell key={model.id} className="text-center">
											{renderBool(model.reasoning, t)}
										</TableCell>
									))}
								</TableRow>

								{/* Web access */}
								<TableRow>
									<TableCell className="font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10">
										{t("webAccessCapability")}
									</TableCell>
									{selectedModels.map((model) => (
										<TableCell key={model.id} className="text-center">
											{renderBool(model.web_access, t)}
										</TableCell>
									))}
								</TableRow>

								{/* Parameters */}
								<TableRow>
									<TableCell className="font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10">
										{t("parameters")}
									</TableCell>
									{selectedModels.map((model) => (
										<TableCell
											key={model.id}
											className="text-center"
										>
							{model.parameter_count
								? formatScaledCount(model.parameter_count, 1e9, "B", locale)
												: "-"}
										</TableCell>
									))}
								</TableRow>

								{/* Training Tokens */}
								<TableRow>
									<TableCell className="font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10">
										{t("trainingTokens")}
									</TableCell>
									{selectedModels.map((model) => (
										<TableCell
											key={model.id}
											className="text-center"
										>
							{model.training_tokens
								? formatScaledCount(model.training_tokens, 1e12, "T", locale)
												: "-"}
										</TableCell>
									))}
								</TableRow>

								{/* License */}
								<TableRow>
									<TableCell className="font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10">
										{t("license")}
									</TableCell>
									{selectedModels.map((model) => (
										<TableCell
											key={model.id}
											className="text-center"
										>
											{formatLicenseLabel(model.license, t)}
										</TableCell>
									))}
								</TableRow>

								{/* Knowledge Cutoff */}
								<TableRow>
									<TableCell className="font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10">
										{t("knowledgeCutoff")}
									</TableCell>
									{selectedModels.map((model) => (
										<TableCell
											key={model.id}
											className="text-center"
										>
											{formatMonthYear(model.knowledge_cutoff)}
										</TableCell>
									))}
								</TableRow>

								{/* Status */}
								<TableRow>
									<TableCell className="font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10">
										{t("statusLabel")}
									</TableCell>
									{selectedModels.map((model) => (
										<TableCell key={model.id} className="text-center">
											{model.status ? translateModelStatus(model.status, t) : "-"}
										</TableCell>
									))}
								</TableRow>

								{/* Release */}
								<TableRow>
									<TableCell className="font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10">
										{t("release")}
									</TableCell>
									{selectedModels.map((model) => (
										<TableCell key={model.id} className="text-center">
											{formatMonthYear(model.release_date)}
										</TableCell>
									))}
								</TableRow>

								{/* Announced */}
								<TableRow>
									<TableCell className="font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10">
										{t("announced")}
									</TableCell>
									{selectedModels.map((model) => (
										<TableCell key={model.id} className="text-center">
											{formatMonthYear(model.announced_date)}
										</TableCell>
									))}
								</TableRow>

								{/* Deprecation */}
								<TableRow>
									<TableCell className="font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10">
										{t("deprecation")}
									</TableCell>
									{selectedModels.map((model) => (
										<TableCell key={model.id} className="text-center">
											{formatMonthYear(model.deprecation_date)}
										</TableCell>
									))}
								</TableRow>

								{/* Retirement */}
								<TableRow>
									<TableCell className="font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10">
										{t("retirement")}
									</TableCell>
									{selectedModels.map((model) => (
										<TableCell key={model.id} className="text-center">
											{formatMonthYear(model.retirement_date)}
										</TableCell>
									))}
								</TableRow>

								{/* Links */}
								<TableRow>
									<TableCell className="font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10">
										{t("links")}
									</TableCell>
									{selectedModels.map((model) => (
										<TableCell key={model.id} className="text-center">
											<div className="flex flex-wrap justify-center gap-2 text-xs">
												{model.api_reference_link ? (
													<Link
														href={model.api_reference_link}
														target="_blank"
														rel="noopener noreferrer"
														className="underline decoration-transparent hover:decoration-current transition-colors duration-200"
													>
														{t("docs")}
													</Link>
												) : null}
												{model.repository_link ? (
													<Link
														href={model.repository_link}
														target="_blank"
														rel="noopener noreferrer"
														className="underline decoration-transparent hover:decoration-current transition-colors duration-200"
													>
														{t("repository")}
													</Link>
												) : null}
												{model.paper_link ? (
													<Link
														href={model.paper_link}
														target="_blank"
														rel="noopener noreferrer"
														className="underline decoration-transparent hover:decoration-current transition-colors duration-200"
													>
														{t("paper")}
													</Link>
												) : null}
												{model.announcement_link ? (
													<Link
														href={model.announcement_link}
														target="_blank"
														rel="noopener noreferrer"
														className="underline decoration-transparent hover:decoration-current transition-colors duration-200"
													>
														{t("announcement")}
													</Link>
												) : null}
												{model.weights_link ? (
													<Link
														href={model.weights_link}
														target="_blank"
														rel="noopener noreferrer"
														className="underline decoration-transparent hover:decoration-current transition-colors duration-200"
													>
														{t("weights")}
													</Link>
												) : null}
												{!model.api_reference_link &&
												!model.repository_link &&
												!model.paper_link &&
												!model.announcement_link &&
												!model.weights_link ? (
													<span className="text-muted-foreground">-</span>
												) : null}
											</div>
										</TableCell>
									))}
								</TableRow>

								{/* Operational Metrics Section */}
								<TableRow className="bg-zinc-100/50 dark:bg-zinc-800/50">
									<TableCell
										colSpan={selectedModels.length + 1}
										className="font-semibold sticky left-0 bg-zinc-100/50 dark:bg-zinc-800/50 z-10"
									>
										{t("operationalMetrics")}
									</TableCell>
								</TableRow>

								{/* Cost per 1M Tokens */}
								<TableRow>
									<TableCell className="font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10">
										{t("costPerMillionTokens")}
									</TableCell>
									{selectedModels.map((model) => {
										const inputPrice = getInputPrice(model);
										const outputPrice =
											getOutputPrice(model);
										return (
											<TableCell
												key={model.id}
												className="text-center"
											>
												<div className="flex items-center justify-center gap-1">
													{t("input")}: {" "}
													{inputPrice !== null
										? formatCurrency(inputPrice * 1_000_000, locale)
														: "-"}
													{inputPrice ===
														bestInputPrice &&
														bestInputPrice !==
															null && (
															<Star className="h-4 w-4 text-emerald-600 fill-emerald-500" />
														)}
												</div>
												<div className="flex items-center justify-center gap-1">
													{t("output")}: {" "}
													{outputPrice !== null
										? formatCurrency(outputPrice * 1_000_000, locale)
														: "-"}
													{outputPrice ===
														bestOutputPrice &&
														bestOutputPrice !==
															null && (
															<Star className="h-4 w-4 text-emerald-600 fill-emerald-500" />
														)}
												</div>
											</TableCell>
										);
									})}
								</TableRow>

								{/* Latency */}
								<TableRow>
									<TableCell className="font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10">
										{t("latency")}
									</TableCell>
									{selectedModels.map((model) => {
										const latency = getLatency(model);
										return (
											<TableCell
												key={model.id}
												className="text-center"
											>
												<div className="flex items-center justify-center gap-1">
													{latency !== null &&
													latency !== undefined
								? `${Number(latency).toLocaleString(locale)} ms`
														: "-"}
													{latency === bestLatency &&
														bestLatency !==
															null && (
															<Star className="h-4 w-4 text-emerald-600 fill-emerald-500" />
														)}
												</div>
											</TableCell>
										);
									})}
								</TableRow>

								{/* Throughput */}
								<TableRow>
									<TableCell className="font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10">
										{t("throughput")}
									</TableCell>
									{selectedModels.map((model) => {
										const throughput = getThroughput(model);
										return (
											<TableCell
												key={model.id}
												className="text-center"
											>
												<div className="flex items-center justify-center gap-1">
													{throughput !== null &&
													throughput !== undefined
								? `${Number(throughput).toLocaleString(locale)} ${t("tokenUnit")}/s`
														: "-"}
													{throughput ===
														bestThroughput &&
														bestThroughput !==
															null && (
															<Star className="h-4 w-4 text-emerald-600 fill-emerald-500" />
														)}
												</div>
											</TableCell>
										);
									})}
								</TableRow>

								{/* Benchmarks Section */}
								<TableRow className="bg-zinc-100/50 dark:bg-zinc-800/50">
									<TableCell
										colSpan={selectedModels.length + 1}
										className="font-semibold sticky left-0 bg-zinc-100/50 dark:bg-zinc-800/50 z-10"
									>
										{t("benchmarks")}
									</TableCell>
								</TableRow>

								{/* Dynamic Benchmark Scores */}
								{allBenchmarks.map((benchmarkName) => {
									const benchmarkEntry = selectedModels
										.flatMap((model) => model.benchmark_results ?? [])
										.find((b) => b.benchmark.name === benchmarkName);
									const benchmarkOrder = benchmarkEntry?.benchmark.order;
									const benchmarkType = benchmarkEntry?.benchmark.type;
									const isLowerBetter = getLowerIsBetter(benchmarkOrder);

									const rawScores = selectedModels.map((model) =>
										model.benchmark_results?.find(
											(b) => b.benchmark.name === benchmarkName
										)?.score
									);
									const isPercent = resolveBenchmarkIsPercentage({
										benchmarkType,
										fallback: rawScores.some(
											(score) =>
												typeof score === "string" &&
												String(score).trim().endsWith("%")
										),
									});
									const scores = rawScores.map((score) =>
										normalizeBenchmarkScoreValue(
											parseBenchmarkScore(score as any),
											isPercent
										)
									);

									// Find the best score (max by default; min for ascending/lower-better benchmarks)
									const validScores = scores.filter(
										(s) =>
											typeof s === "number" && !isNaN(s)
									) as number[];
									const bestScore =
										validScores.length > 0
											? isLowerBetter
												? Math.min(...validScores)
												: Math.max(...validScores)
											: null;

									return (
										<TableRow key={benchmarkName}>
											<TableCell className="font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10">
												{benchmarkNameToId[
													benchmarkName
												] ? (
													<Link
														href={`/benchmarks/${encodeURIComponent(
															benchmarkNameToId[
																benchmarkName
															]
														)}`}
														className="group"
													>
														<span className="relative underline decoration-transparent group-hover:decoration-current transition-colors duration-200">
															{benchmarkName}
														</span>
													</Link>
												) : (
													<span>{benchmarkName}</span>
												)}
											</TableCell>
											{selectedModels.map(
												(model, idx) => {
													const numericScore =
														scores[idx];
													const hasScore =
														numericScore !== null &&
														!isNaN(
															Number(numericScore)
														);
													// Only normalise to 100% if NOT percent-based
													const percentOfBest =
														bestScore &&
														hasScore
															? isLowerBetter
																? bestScore > 0 && numericScore > 0
																	? (bestScore / numericScore) * 100
																	: 0
																: (numericScore / bestScore) * 100
															: 0;

													return (
														<TableCell
															key={model.id}
															className="text-center"
														>
															{hasScore ? (
																<div className="flex items-center gap-2">
																	<div className="flex-grow">
																		<Progress
																			value={
																				isPercent && numericScore <= 100
																					? numericScore
																					: percentOfBest
																			}
																			className={cn(
																				"h-2 w-full",
																				numericScore ===
																					bestScore
																					? "[&>div]:bg-emerald-500"
																					: "[&>div]:bg-zinc-200 dark:[&>div]:bg-zinc-700"
																			)}
																		/>
																	</div>
																	<span
																		className={cn(
																			"text-sm tabular-nums",
																			numericScore ===
																				bestScore
																				? "text-emerald-700 dark:text-emerald-400 font-medium"
																				: "text-zinc-500 dark:text-zinc-400"
																		)}
																	>
																			{`${format.number(numericScore, {
																				maximumFractionDigits: 2,
																				notation: "standard",
																			})}${isPercent ? "%" : ""}`}
																	</span>
																</div>
															) : (
																"-"
															)}
														</TableCell>
													);
												}
											)}
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			</div>

			{/* Mobile Cards View */}
			<div className="md:hidden space-y-4">
				{selectedModels.map((model) => {
					const inputPrice = getInputPrice(model);
					const outputPrice = getOutputPrice(model);
					const latency = getLatency(model);
					const throughput = getThroughput(model);
					return (
						<Card key={model.id}>
							<CardHeader>
								<div className="flex items-center gap-3">
									<Link
										href={`/organisations/${model.provider.provider_id}`}
										className="focus:outline-none"
									>
										<ProviderLogo
											id={model.provider.provider_id}
											alt={model.provider.name}
											size="sm"
										/>
									</Link>
									<div className="flex flex-col">
										<Link
											href={`/models/${model.id}`}
											className="font-medium underline decoration-transparent hover:decoration-current transition-colors duration-200 focus:outline-none"
										>
											{model.name}
										</Link>
										<Link
											href={`/organisations/${model.provider.provider_id}`}
											className="text-xs text-muted-foreground underline decoration-transparent hover:decoration-current transition-colors duration-200 focus:outline-none"
										>
											{model.provider.name}
										</Link>
									</div>
								</div>
							</CardHeader>
							<CardContent className="space-y-4">
								<h3 className="font-semibold">
										{t("generalInformation")}
								</h3>
								{/* General Information */}
								<div className="border-b pb-2">
									<div className="space-y-1">
										<div className="flex flex-col">
											<span className="font-medium">
												{t("contextWindow")}:
											</span>
											<div className="flex justify-between pl-4">
													<span>{t("input")}:</span>
												<span>
													{model.input_context_length != null ? format.number(model.input_context_length) :
														"-"}
												</span>
											</div>
											<div className="flex justify-between pl-4">
													<span>{t("output")}:</span>
												<span>
													{model.output_context_length != null ? format.number(model.output_context_length) :
														"-"}
												</span>
											</div>
										</div>
										<div className="flex justify-between">
											<span className="font-medium">
													{t("parameters")}:
											</span>
											<span>
							{model.parameter_count
								? formatScaledCount(model.parameter_count, 1e9, "B", locale)
													: "-"}
											</span>
										</div>
										<div className="flex justify-between">
											<span className="font-medium">
													{t("trainingTokens")}:
											</span>
											<span>
							{model.training_tokens
								? formatScaledCount(model.training_tokens, 1e12, "T", locale)
													: "-"}
											</span>
										</div>
										<div className="flex justify-between">
											<span className="font-medium">
													{t("license")}:
											</span>
													<span>{formatLicenseLabel(model.license, t)}</span>
										</div>
										<div className="flex justify-between">
											<span className="font-medium">
													{t("knowledgeCutoff")}:
											</span>
											<span>
														{model.knowledge_cutoff
															? format.calendarDate(model.knowledge_cutoff)
															: "-"}
											</span>
										</div>
									</div>
								</div>
								{/* Operational Metrics */}
								<h3 className="font-semibold pt-2">
													{t("operationalMetrics")}
								</h3>
								<div className="border-b pb-2 pt-2">
									<div className="space-y-1">
										<div className="flex flex-col">
											<span className="font-medium">
													{t("costPerMillionTokens")}:
											</span>
											<div className="flex justify-between pl-4">
														<span>{t("input")}:</span>
												<span className="flex items-center gap-1">
													{inputPrice !== null
										? formatCurrency(inputPrice * 1_000_000, locale)
														: "-"}
													{inputPrice ===
														bestInputPrice && (
														<Star className="inline h-4 w-4 text-emerald-600 fill-emerald-500" />
													)}
												</span>
											</div>
											<div className="flex justify-between pl-4">
														<span>{t("output")}:</span>
												<span className="flex items-center gap-1">
													{outputPrice !== null
										? formatCurrency(outputPrice * 1_000_000, locale)
														: "-"}
													{outputPrice ===
														bestOutputPrice && (
														<Star className="inline h-4 w-4 text-emerald-600 fill-emerald-500" />
													)}
												</span>
											</div>
										</div>
										<div className="flex justify-between">
											<span className="font-medium">
													{t("latency")}:
											</span>
											<span>
												{latency !== null &&
												latency !== undefined
								? `${Number(latency).toLocaleString(locale)} ms`
													: "-"}
												{latency === bestLatency && (
													<Star className="inline h-4 w-4 text-emerald-600 fill-emerald-500" />
												)}
											</span>
										</div>
										<div className="flex justify-between">
											<span className="font-medium">
													{t("throughput")}:
											</span>
											<span>
												{throughput !== null &&
												throughput !== undefined
								? `${Number(throughput).toLocaleString(locale)} ${t("tokenUnit")}/s`
													: "-"}
												{throughput ===
													bestThroughput && (
													<Star className="inline h-4 w-4 text-emerald-600 fill-emerald-500" />
												)}
											</span>
										</div>
									</div>
								</div>
								{/* Benchmarks */}
								<h3 className="font-semibold pt-2">
										{t("benchmarks")}
								</h3>
								<div className="pt-2">
									<div className="space-y-1">
										{allBenchmarks
											.filter((benchmarkName) =>
												model.benchmark_results?.some(
													(b) =>
														b.benchmark.name ===
														benchmarkName
												)
											)
											.map((benchmarkName) => {
												const benchmarkEntry =
													selectedModels
														.flatMap(
															(m) =>
																m.benchmark_results ??
																[]
														)
														.find(
															(b) =>
																b.benchmark
																	.name ===
																benchmarkName
														);
												const benchmarkType =
													benchmarkEntry?.benchmark
														.type;
												const benchmarkOrder =
													benchmarkEntry?.benchmark
														.order;
												const isLowerBetter =
													getLowerIsBetter(
														benchmarkOrder
													);
												const rawScore =
													model.benchmark_results?.find(
														(b) =>
															b.benchmark.name ===
															benchmarkName
													)?.score;
												const rawScores =
													selectedModels.map(
														(m) =>
															m.benchmark_results?.find(
																(b) =>
																	b.benchmark
																		.name ===
																	benchmarkName
															)?.score
													);
												const isPercent =
													resolveBenchmarkIsPercentage(
														{
															benchmarkType,
															fallback:
																rawScores.some(
																	(score) =>
																		typeof score ===
																			"string" &&
																		String(
																			score
																		)
																			.trim()
																			.endsWith(
																				"%"
																			)
																),
														}
													);
												const num =
													normalizeBenchmarkScoreValue(
														parseBenchmarkScore(
															rawScore as
																| string
																| number
																| null
																| undefined
														),
														isPercent
													);
												const bestScores =
													rawScores
														.map((score) =>
															normalizeBenchmarkScoreValue(
																parseBenchmarkScore(
																	score as
																		| string
																		| number
																		| null
																		| undefined
																),
																isPercent
															)
														)
														.filter(
															(
																n
															): n is number =>
																n != null &&
																!Number.isNaN(
																	n
																)
														);
												const bestVal =
													bestScores.length
														? isLowerBetter
															? Math.min(
																	...bestScores
															  )
															: Math.max(
																	...bestScores
															  )
														: null;
														const disp =
															num != null
																? `${format.number(num, {
																		maximumFractionDigits: 2,
																		notation: "standard",
																  })}${isPercent ? "%" : ""}`
																: "-";
												return (
													<div
														key={benchmarkName}
														className="flex items-center gap-1"
													>
														<span className="flex-1">
															{benchmarkNameToId[
																benchmarkName
															] ? (
																<Link
																	href={`/benchmarks/${encodeURIComponent(
																		benchmarkNameToId[
																			benchmarkName
																		]
																	)}`}
																	className="group"
																>
																	<span className="relative underline decoration-transparent group-hover:decoration-current transition-colors duration-200 font-semibold">
																		{
																			benchmarkName
																		}
																	</span>
																</Link>
															) : (
																<span>
																	{
																		benchmarkName
																	}
																</span>
															)}
														</span>
														<span className="tabular-nums">
															{disp}
														</span>
														{num !== null &&
															bestVal !== null &&
															num === bestVal && (
															<Star className="inline h-4 w-4 text-emerald-600 fill-emerald-500" />
														)}
													</div>
												);
											})}
									</div>
								</div>
							</CardContent>
						</Card>
					);
				})}
			</div>
		</section>
	);
}
