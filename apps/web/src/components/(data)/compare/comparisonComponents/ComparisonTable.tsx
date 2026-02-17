import React from "react";
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

interface ComparisonTableProps {
	selectedModels: ExtendedModel[];
}

function renderBool(value: boolean | null | undefined) {
	if (value === true) return <Check className="mx-auto h-4 w-4 text-emerald-600" />;
	if (value === false) return <X className="mx-auto h-4 w-4 text-muted-foreground" />;
	return <span className="block text-center text-xs text-muted-foreground">-</span>;
}

function formatMonthYear(value: string | null | undefined): string {
	if (!value) return "-";
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return "-";
	return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatLicenseLabel(value: string | null | undefined): string {
	const raw = typeof value === "string" ? value.trim() : "";
	if (!raw) return "-";
	const lower = raw.toLowerCase();
	if (lower === "unknown" || lower === "n/a" || lower === "na" || lower === "tbd")
		return "Unknown";
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

function normalizeTypeLabel(value: string): string {
	const v = value.trim().toLowerCase();
	if (v === "text") return "Text";
	if (v === "image") return "Vision";
	if (v === "audio") return "Audio";
	if (v === "video") return "Video";
	if (v === "embedding" || v === "embeddings") return "Embeddings";
	return value;
}

function formatTypes(value: ExtendedModel["input_types"]): string {
	const list = toTypeList(value).map(normalizeTypeLabel);
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
				<h2 className="text-lg font-semibold">Details</h2>
				<p className="text-sm text-muted-foreground">
					A deeper field-by-field view (including benchmarks, pricing, and links).
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
														<span className="relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-current after:transition-all after:duration-300 group-hover:after:w-full font-medium">
															{model.name}
														</span>
													</Link>
													<Link
														href={`/organisations/${model.provider.provider_id}`}
														className="group text-xs text-muted-foreground"
													>
														<span className="relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-current after:transition-all after:duration-300 group-hover:after:w-full">
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
										General Information
									</TableCell>
								</TableRow>

								{/* Context Window */}
								<TableRow>
									<TableCell className="font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10">
										Context Window
									</TableCell>
									{selectedModels.map((model) => (
										<TableCell
											key={model.id}
											className="text-center"
										>
											Input:{" "}
											{model.input_context_length?.toLocaleString() ||
												"-"}
											<br />
											Output:{" "}
											{model.output_context_length?.toLocaleString() ||
												"-"}
										</TableCell>
									))}
								</TableRow>

								{/* Modalities */}
								<TableRow>
									<TableCell className="font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10">
										Modalities
									</TableCell>
									{selectedModels.map((model) => (
										<TableCell key={model.id} className="text-center">
											<div className="text-xs">
												<div>
													<span className="text-muted-foreground">In:</span>{" "}
													{formatTypes(model.input_types)}
												</div>
												<div className="mt-1">
													<span className="text-muted-foreground">Out:</span>{" "}
													{formatTypes(model.output_types)}
												</div>
											</div>
										</TableCell>
									))}
								</TableRow>

								{/* Reasoning */}
								<TableRow>
									<TableCell className="font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10">
										Reasoning
									</TableCell>
									{selectedModels.map((model) => (
										<TableCell key={model.id} className="text-center">
											{renderBool(model.reasoning)}
										</TableCell>
									))}
								</TableRow>

								{/* Web access */}
								<TableRow>
									<TableCell className="font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10">
										Web access
									</TableCell>
									{selectedModels.map((model) => (
										<TableCell key={model.id} className="text-center">
											{renderBool(model.web_access)}
										</TableCell>
									))}
								</TableRow>

								{/* Parameters */}
								<TableRow>
									<TableCell className="font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10">
										Parameters
									</TableCell>
									{selectedModels.map((model) => (
										<TableCell
											key={model.id}
											className="text-center"
										>
											{model.parameter_count
												? `${(
														model.parameter_count /
														1e9
												  ).toFixed(1)}B`
												: "-"}
										</TableCell>
									))}
								</TableRow>

								{/* Training Tokens */}
								<TableRow>
									<TableCell className="font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10">
										Training Tokens
									</TableCell>
									{selectedModels.map((model) => (
										<TableCell
											key={model.id}
											className="text-center"
										>
											{model.training_tokens
												? `${(
														model.training_tokens /
														1e12
												  ).toFixed(1)}T`
												: "-"}
										</TableCell>
									))}
								</TableRow>

								{/* License */}
								<TableRow>
									<TableCell className="font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10">
										License
									</TableCell>
									{selectedModels.map((model) => (
										<TableCell
											key={model.id}
											className="text-center"
										>
											{formatLicenseLabel(model.license)}
										</TableCell>
									))}
								</TableRow>

								{/* Knowledge Cutoff */}
								<TableRow>
									<TableCell className="font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10">
										Knowledge Cutoff
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
										Status
									</TableCell>
									{selectedModels.map((model) => (
										<TableCell key={model.id} className="text-center">
											{model.status ?? "-"}
										</TableCell>
									))}
								</TableRow>

								{/* Release */}
								<TableRow>
									<TableCell className="font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10">
										Release
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
										Announced
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
										Deprecation
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
										Retirement
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
										Links
									</TableCell>
									{selectedModels.map((model) => (
										<TableCell key={model.id} className="text-center">
											<div className="flex flex-wrap justify-center gap-2 text-xs">
												{model.api_reference_link ? (
													<Link
														href={model.api_reference_link}
														target="_blank"
														rel="noopener noreferrer"
														className="hover:underline"
													>
														Docs
													</Link>
												) : null}
												{model.repository_link ? (
													<Link
														href={model.repository_link}
														target="_blank"
														rel="noopener noreferrer"
														className="hover:underline"
													>
														Repo
													</Link>
												) : null}
												{model.paper_link ? (
													<Link
														href={model.paper_link}
														target="_blank"
														rel="noopener noreferrer"
														className="hover:underline"
													>
														Paper
													</Link>
												) : null}
												{model.announcement_link ? (
													<Link
														href={model.announcement_link}
														target="_blank"
														rel="noopener noreferrer"
														className="hover:underline"
													>
														Announcement
													</Link>
												) : null}
												{model.weights_link ? (
													<Link
														href={model.weights_link}
														target="_blank"
														rel="noopener noreferrer"
														className="hover:underline"
													>
														Weights
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
										Operational Metrics
									</TableCell>
								</TableRow>

								{/* Cost per 1M Tokens */}
								<TableRow>
									<TableCell className="font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10">
										Cost per 1M Tokens
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
													Input:{" "}
													{inputPrice !== null
														? `$${(
																inputPrice *
																1_000_000
														  ).toFixed(2)}`
														: "-"}
													{inputPrice ===
														bestInputPrice &&
														bestInputPrice !==
															null && (
															<Star className="h-4 w-4 text-emerald-600 fill-emerald-500" />
														)}
												</div>
												<div className="flex items-center justify-center gap-1">
													Output:{" "}
													{outputPrice !== null
														? `$${(
																outputPrice *
																1_000_000
														  ).toFixed(2)}`
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
										Latency
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
														? `${latency}ms`
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
										Throughput
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
														? `${throughput} tokens/s`
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
										Benchmarks
									</TableCell>
								</TableRow>

								{/* Dynamic Benchmark Scores */}
								{allBenchmarks.map((benchmarkName) => {
									// Gather all scores and check if any score is a string with a %
									const rawScores = selectedModels.map(
										(model) => {
											const score =
												model.benchmark_results?.find(
													(b) =>
														b.benchmark.name ===
														benchmarkName
												)?.score;
											return score;
										}
									);

									const isPercent = rawScores.some(
										(score) =>
											typeof score === "string" &&
											String(score).trim().endsWith("%")
									);

									const order = selectedModels
										.flatMap((model) => model.benchmark_results ?? [])
										.find((b) => b.benchmark.name === benchmarkName)
										?.benchmark.order;
									const normalizedOrder = String(order ?? "").toLowerCase();
									const isLowerBetter =
										normalizedOrder === "ascending" ||
										normalizedOrder.includes("ascending") ||
										normalizedOrder.includes("lower");

									// Parse all scores to numbers (strip % if needed)
									const scores = rawScores.map((score) => {
										if (
											score === undefined ||
											score === null
										)
											return null;
										if (typeof score === "string") {
											const s = score.trim();
											if (s.endsWith("%"))
												return parseFloat(
													s.replace("%", "")
												);
											return parseFloat(s);
										}
										return score;
									});

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
														<span className="relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-current after:transition-all after:duration-300 group-hover:after:w-full">
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
														!isPercent &&
														bestScore &&
														hasScore
															? isLowerBetter
																? bestScore > 0 && numericScore > 0
																	? (bestScore / numericScore) * 100
																	: 0
																: (numericScore / bestScore) * 100
															: isPercent &&
															  hasScore
															? numericScore
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
																				isPercent
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
																		{isPercent
																			? `${numericScore.toFixed(
																					2
																			  )}%`
																			: numericScore.toLocaleString(
																					undefined,
																					{
																						maximumFractionDigits: 2,
																					}
																			  )}
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
											className="font-medium hover:underline focus:outline-none"
										>
											{model.name}
										</Link>
										<Link
											href={`/organisations/${model.provider.provider_id}`}
											className="text-xs text-muted-foreground hover:underline focus:outline-none"
										>
											{model.provider.name}
										</Link>
									</div>
								</div>
							</CardHeader>
							<CardContent className="space-y-4">
								<h3 className="font-semibold">
									General Information
								</h3>
								{/* General Information */}
								<div className="border-b pb-2">
									<div className="space-y-1">
										<div className="flex flex-col">
											<span className="font-medium">
												Context Window:
											</span>
											<div className="flex justify-between pl-4">
												<span>Input:</span>
												<span>
													{model.input_context_length?.toLocaleString() ||
														"-"}
												</span>
											</div>
											<div className="flex justify-between pl-4">
												<span>Output:</span>
												<span>
													{model.output_context_length?.toLocaleString() ||
														"-"}
												</span>
											</div>
										</div>
										<div className="flex justify-between">
											<span className="font-medium">
												Parameters:
											</span>
											<span>
												{model.parameter_count
													? `${(
															model.parameter_count /
															1e9
													  ).toFixed(1)}B`
													: "-"}
											</span>
										</div>
										<div className="flex justify-between">
											<span className="font-medium">
												Train Tokens:
											</span>
											<span>
												{model.training_tokens
													? `${(
															model.training_tokens /
															1e12
													  ).toFixed(1)}T`
													: "-"}
											</span>
										</div>
										<div className="flex justify-between">
											<span className="font-medium">
												License:
											</span>
											<span>{formatLicenseLabel(model.license)}</span>
										</div>
										<div className="flex justify-between">
											<span className="font-medium">
												Knowledge Cutoff:
											</span>
											<span>
												{model.knowledge_cutoff
													? new Date(
															model.knowledge_cutoff
													  ).toLocaleString(
															"en-US",
															{
																month: "short",
																year: "numeric",
															}
													  )
													: "-"}
											</span>
										</div>
									</div>
								</div>
								{/* Operational Metrics */}
								<h3 className="font-semibold pt-2">
									Operational Metrics
								</h3>
								<div className="border-b pb-2 pt-2">
									<div className="space-y-1">
										<div className="flex flex-col">
											<span className="font-medium">
												Cost per 1M Tokens:
											</span>
											<div className="flex justify-between pl-4">
												<span>Input:</span>
												<span className="flex items-center gap-1">
													{inputPrice !== null
														? `$${(
																inputPrice *
																1_000_000
														  ).toFixed(2)}`
														: "-"}
													{inputPrice ===
														bestInputPrice && (
														<Star className="inline h-4 w-4 text-emerald-600 fill-emerald-500" />
													)}
												</span>
											</div>
											<div className="flex justify-between pl-4">
												<span>Output:</span>
												<span className="flex items-center gap-1">
													{outputPrice !== null
														? `$${(
																outputPrice *
																1_000_000
														  ).toFixed(2)}`
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
												Latency:
											</span>
											<span>
												{latency !== null &&
												latency !== undefined
													? `${latency}ms`
													: "-"}
												{latency === bestLatency && (
													<Star className="inline h-4 w-4 text-emerald-600 fill-emerald-500" />
												)}
											</span>
										</div>
										<div className="flex justify-between">
											<span className="font-medium">
												Throughput:
											</span>
											<span>
												{throughput !== null &&
												throughput !== undefined
													? `${throughput} tokens/s`
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
									Benchmarks
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
												const rawScore =
													model.benchmark_results?.find(
														(b) =>
															b.benchmark.name ===
															benchmarkName
													)?.score;
												let num = null;
												if (rawScore != null)
													num =
														typeof rawScore ===
														"string"
															? parseFloat(
																	rawScore.replace(
																		"%",
																		""
																	)
															  )
															: rawScore;
												const bestScores =
													selectedModels
														.map((m) => {
															const r =
																m.benchmark_results?.find(
																	(b) =>
																		b
																			.benchmark
																			.name ===
																		benchmarkName
																)?.score;
															return r == null
																? NaN
																: typeof r ===
																  "string"
																? parseFloat(
																		r.replace(
																			"%",
																			""
																		)
																  )
																: r;
														})
														.filter(
															(n) => !isNaN(n)
														) as number[];
												const bestVal =
													bestScores.length
														? Math.max(
																...bestScores
														  )
														: null;
												const disp =
													num != null
														? `${num.toLocaleString(
																undefined,
																{
																	maximumFractionDigits: 2,
																}
														  )}${
																typeof rawScore ===
																	"string" &&
																String(rawScore)
																	.trim()
																	.endsWith(
																		"%"
																	)
																	? "%"
																	: ""
														  }`
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
																	<span className="relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-current after:transition-all after:duration-300 group-hover:after:w-full font-semibold">
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
														{num === bestVal && (
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
