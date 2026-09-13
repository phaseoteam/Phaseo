"use client";

import React from "react";
import Link from "next/link";
import { ChevronRight, ChevronDown, ExternalLink } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatArtificialAnalysisScore, isArtificialAnalysisBenchmark } from "@/lib/benchmarks/artificialAnalysis";
import {
	formatBenchmarkScore,
	normalizeBenchmarkScoreValue,
	parseBenchmarkScore,
	resolveBenchmarkIsPercentage,
} from "@/lib/benchmarks/scoreFormat";

interface ClientProps {
	models: any[]; // flat list of models with provider and benchmark_results
	benchmarkId: string;
	benchmarkType: string | null;
	isLowerBetter: boolean;
}

const reportedDateFormatter = new Intl.DateTimeFormat("en-GB", {
	day: "2-digit",
	month: "short",
	year: "numeric",
});

function formatReportedDate(value?: string | null) {
	if (!value) return "-";
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return "-";
	return reportedDateFormatter.format(parsed);
}

function configurationLabel(result: any) {
	const variant = typeof result?.variant === "string" ? result.variant : null;
	if (variant === "none") return "Non-reasoning";
	if (variant === "xhigh") return "Xhigh";
	if (variant) return variant.charAt(0).toUpperCase() + variant.slice(1);
	const description = typeof result?.other_info === "string" ? result.other_info.split(";")[0] : "";
	const detail = description.match(/\((.+)\)$/)?.[1] ?? "";
	if (/max effort/i.test(detail)) return "Max";
	const namedEffort = detail.match(/\b(none|low|medium|high|xhigh|max)\b/i)?.[1];
	return namedEffort ? (namedEffort.toLowerCase() === "none" ? "Non-reasoning" : namedEffort.charAt(0).toUpperCase() + namedEffort.slice(1).toLowerCase()) : "Default";
}

export default function ModelsUsingBenchmarkClient({
	models,
	benchmarkId,
	benchmarkType,
	isLowerBetter,
}: ClientProps) {
	const [openRows, setOpenRows] = React.useState<Record<string, boolean>>({});
	const [search, setSearch] = React.useState("");
	const [configuration, setConfiguration] = React.useState("all");
	const [limit, setLimit] = React.useState(25);
	const filteredModels = models.filter((model) => `${model.name} ${model.organisation?.display_name ?? ""}`.toLowerCase().includes(search.toLowerCase()));
	const artificialAnalysis = isArtificialAnalysisBenchmark(benchmarkId);
	const allArtificialAnalysisRows = models.flatMap((model) => (model.benchmark_results || []).map((result: any) => ({ model, result })));
	const configurations = [...new Set(allArtificialAnalysisRows.map(({ result }) => configurationLabel(result)))].sort();
	const artificialAnalysisRows = allArtificialAnalysisRows.filter(({ result }) => configuration === "all" || configurationLabel(result) === configuration).sort((left, right) => {
		const difference = Number(left.result.score) - Number(right.result.score);
		return isLowerBetter ? difference : -difference;
	}).map((row, index, rows) => ({
		...row,
		rank: index > 0 && Number(rows[index - 1].result.score) === Number(row.result.score) ? rows.slice(0, index).findIndex((item) => Number(item.result.score) === Number(row.result.score)) + 1 : index + 1,
	}));
	const visibleArtificialAnalysisRows = artificialAnalysisRows.filter(({ model }) => `${model.name} ${model.organisation?.display_name ?? ""}`.toLowerCase().includes(search.toLowerCase()));

	function formatScoreDisplay(r: any) {
		const rawScore = r?.score ?? "N/A";
		const isPercentage = resolveBenchmarkIsPercentage({
			benchmarkType,
			rawScore,
		});
		const parsed = normalizeBenchmarkScoreValue(
			parseBenchmarkScore(rawScore),
			isPercentage
		);
		if (parsed !== null) {
			if (isArtificialAnalysisBenchmark(benchmarkId)) return formatArtificialAnalysisScore(benchmarkId, parsed);
			return formatBenchmarkScore({
				value: parsed,
				isPercentage,
				fallback: rawScore,
			});
		}
		if (rawScore !== "N/A" && typeof rawScore === "string") return rawScore;
		return rawScore;
	}

	function sortResults(resultsArr: any[], isLowerBetter = false) {
		return [...resultsArr].sort((a, b) => {
			if (a.rank != null && b.rank != null) {
				const diff = a.rank - b.rank;
				if (diff !== 0) return diff;
			}
			const isAPercentage = resolveBenchmarkIsPercentage({
				benchmarkType,
				rawScore: a.score,
			});
			const isBPercentage = resolveBenchmarkIsPercentage({
				benchmarkType,
				rawScore: b.score,
			});
			const pb = normalizeBenchmarkScoreValue(
				parseBenchmarkScore(b.score ?? ""),
				isBPercentage
			);
			const pa = normalizeBenchmarkScoreValue(
				parseBenchmarkScore(a.score ?? ""),
				isAPercentage
			);
			if (pa != null && pb != null) {
				return isLowerBetter ? pa - pb : pb - pa;
			}
			return (a.score || "")
				.toString()
				.localeCompare((b.score || "").toString());
		});
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h3 className="text-lg font-semibold">
					Model Results
				</h3>
				<div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
					{artificialAnalysis ? <Select value={configuration} onValueChange={(value) => { setConfiguration(value); setLimit(25); }}><SelectTrigger aria-label="Filter Results by Configuration" className="sm:w-48"><SelectValue>{configuration === "all" ? "All Configurations" : configuration}</SelectValue></SelectTrigger><SelectContent><SelectItem value="all">All Configurations</SelectItem>{configurations.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select> : null}
					<Input aria-label="Search Benchmark Results" placeholder="Search Models" value={search} onChange={(event) => { setSearch(event.target.value); setLimit(25); }} className="sm:w-64" />
				</div>
			</div>
			{visibleArtificialAnalysisRows.length > 0 && artificialAnalysis ? (
				<div className="overflow-hidden rounded-xl border">
					<div className="overflow-x-auto">
						<table className="min-w-[580px] w-full text-sm">
							<thead className="border-b bg-muted/40 text-xs text-muted-foreground">
								<tr>
									<th className="w-14 px-4 py-3 text-left font-medium">Rank</th>
									<th className="px-3 py-3 text-left font-medium">Model</th>
									<th className="w-24 px-3 py-3 text-right font-medium">Score</th>
									<th className="w-32 px-3 py-3 text-left font-medium">Released</th>
									<th className="w-14 px-3 py-3"><span className="sr-only">Source</span></th>
								</tr>
							</thead>
							<tbody className="divide-y">
								{visibleArtificialAnalysisRows.slice(0, limit).map(({ model, result, rank }, index) => {
									const organisationLabel = model.organisation?.display_name || model.organisation?.name || "Unknown";
									const configuration = configurationLabel(result);
									return <tr key={result.id ?? `${model.id}-${configuration}-${index}`} className="transition-colors hover:bg-muted/25">
											<td className="px-4 py-3 font-medium tabular-nums text-muted-foreground">{rank}</td>
											<td className="px-3 py-3"><div className="flex items-center gap-3">
												<span className="relative size-7 shrink-0 overflow-hidden rounded-md bg-muted"><Logo id={model.organisation?.organisation_id ?? model.id} alt="" fill className="object-contain p-1" /></span>
												<div className="min-w-0"><Link href={`/models/${model.id}`} className="block truncate font-medium hover:underline">{model.name} <span className="text-muted-foreground">({configuration})</span></Link><span className="block truncate text-xs text-muted-foreground">{organisationLabel}</span></div>
											</div></td>
											<td className="px-3 py-3 text-right font-semibold tabular-nums">{formatScoreDisplay(result)}</td>
											<td className="px-3 py-3 text-muted-foreground">{formatReportedDate(model.reported_date)}</td>
											<td className="px-3 py-3 text-right">{result.source_link ? <Button asChild variant="ghost" size="icon-sm"><a href={result.source_link} target="_blank" rel="noreferrer" aria-label={`Open source for ${model.name} ${configuration}`}><ExternalLink /></a></Button> : null}</td>
										</tr>
									;
								})}
							</tbody>
						</table>
					</div>
				</div>
			) : filteredModels.length > 0 ? (
				<div className="overflow-x-auto">
					<table className="min-w-full overflow-hidden rounded-2xl border border-zinc-200 text-sm shadow-xs dark:border-zinc-800">
						<thead className="bg-zinc-100 dark:bg-zinc-800">
							<tr>
								<th className="px-4 py-2 text-left">
									Organisation
								</th>
								<th className="px-4 py-2 text-left">Model</th>
								<th className="px-4 py-2 text-left">
									Reported
								</th>
								<th className="px-4 py-2 text-left">
									Top Score
								</th>
								<th className="px-4 py-2 text-left">Info</th>
								<th className="px-4 py-2 text-center">
									Self Reported
								</th>
								<th className="px-4 py-2 text-left">Source</th>
							</tr>
						</thead>
						<tbody>
							{filteredModels.slice(0, limit).map((model: any) => {
								const sorted = sortResults(
									model.benchmark_results || [],
									isLowerBetter
								);
								const top =
									model.top_score ?? sorted[0] ?? null;
								const topId = top?.id;
								const extraScores = topId
									? sorted.filter((item) => item.id !== topId)
									: sorted.slice(1);
								const anySelf = sorted.some(
									(s) => s.is_self_reported
								);
								const hasMultiple = extraScores.length > 0;
								const isOpen = openRows[model.id] || false;
								const organisationLabel =
									model.organisation?.display_name ||
									model.organisation?.name ||
									model.organisation?.organisation_id ||
									"Unknown";
								const organisationTitle =
									model.organisation?.display_name ??
									model.organisation?.name ??
									organisationLabel;
								const organisationHref = model.organisation
									?.organisation_id
									? `/organisations/${model.organisation.organisation_id}`
									: undefined;
								const organisationNameElement = (
									<span
										className="relative inline-block align-middle truncate text-sm font-normal underline decoration-transparent group-hover:decoration-current transition-colors duration-200"
										title={organisationTitle}
									>
										{organisationLabel}
									</span>
								);

								return (
									<React.Fragment key={model.id}>
										<tr className="border-t border-zinc-200 dark:border-zinc-800">
											<td className="px-4 py-2 text-left">
												<div className="flex items-center gap-3">
													{model.organisation
														?.organisation_id ? (
														<div className="relative h-6 w-6 shrink-0 overflow-hidden rounded">
															<Logo
																id={
																	model
																		.organisation
																		.organisation_id
																}
																alt={
																	model
																		.organisation
																		?.display_name ||
																	model
																		.organisation
																		?.name ||
																	"Organisation logo"
																}
																width={24}
																height={24}
																className="object-contain"
															/>
														</div>
													) : (
														<div className="h-6 w-6 shrink-0 rounded bg-zinc-100 dark:bg-zinc-800" />
													)}

													{organisationHref ? (
														<Link
															href={
																organisationHref
															}
															className="group inline-block"
														>
															{
																organisationNameElement
															}
														</Link>
													) : (
														<span className="group inline-block">
															{
																organisationNameElement
															}
														</span>
													)}
												</div>
											</td>

											<td className="px-4 py-2 font-semibold">
												{hasMultiple && (
													<button
														type="button"
														className="mr-2 inline-flex h-5 w-5 items-center justify-center text-indigo-600 underline decoration-transparent hover:decoration-current transition-colors duration-200 focus:outline-hidden align-middle"
														onClick={() =>
															setOpenRows(
																(prev) => ({
																	...prev,
																	[model.id]:
																		!isOpen,
																})
															)
														}
														aria-label={
															isOpen
																? "Hide scores"
																: "Show scores"
														}
													>
														{isOpen ? (
															<ChevronDown className="h-4 w-4" />
														) : (
															<ChevronRight className="h-4 w-4" />
														)}
													</button>
												)}
												<Link
													href={`/models/${model.id}`}
												>
													<span
														className="relative inline-block align-middle truncate font-semibold underline decoration-transparent hover:decoration-current transition-colors duration-200"
														title={model.name}
													>
														{model.name}
													</span>
												</Link>
											</td>
											<td className="px-4 py-2 text-left">
												{formatReportedDate(
													model.reported_date
												)}
											</td>
											<td className="px-4 py-2 font-mono">
												{top
													? formatScoreDisplay(top)
													: "-"}
											</td>
											<td className="px-4 py-2 text-xs text-zinc-500 dark:text-zinc-300">
												{top?.other_info || "-"}
											</td>
											<td className="px-4 py-2 text-center">
												<span
													className={
														anySelf
															? "rounded bg-yellow-100 px-2 py-1 text-xs font-semibold text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
															: "rounded bg-green-100 px-2 py-1 text-xs font-semibold text-green-800 dark:bg-green-900 dark:text-green-200"
													}
												>
													{anySelf ? "Yes" : "No"}
												</span>
											</td>
											<td className="px-4 py-2 text-left">
												{top?.source_link ? (
													<a
														href={top.source_link}
														target="_blank"
														rel="noopener noreferrer"
														className="group inline-flex items-center text-indigo-600 dark:text-indigo-400"
													>
														<span className="relative inline-block align-middle truncate text-sm font-normal underline decoration-transparent group-hover:decoration-current transition-colors duration-200">
															Source
														</span>
														<ExternalLink className="ml-1 h-3 w-3 text-indigo-500 opacity-0 transition-all group-hover:opacity-100 group-hover:text-indigo-700 dark:text-indigo-400 dark:group-hover:text-indigo-300" />
													</a>
												) : (
													"-"
												)}
											</td>
										</tr>

										{hasMultiple &&
											isOpen &&
											extraScores.map(
												(item: any, idx: number) => (
													<tr
														key={`${item.id}-${idx}`}
														className={`border-t border-zinc-200 bg-zinc-50 text-xs dark:border-zinc-800 dark:bg-zinc-900 ${
															idx ===
															extraScores.length -
																1
																? "rounded-b-xl"
																: ""
														}`}
													>
														<td
															className="px-4 py-2 pl-8 font-mono"
															colSpan={3}
														></td>
														<td className="px-4 py-2 font-mono">
															{formatScoreDisplay(
																item
															)}
														</td>
														<td className="px-4 py-2 text-xs text-zinc-500 dark:text-zinc-300">
															{item.other_info ||
																"-"}
														</td>
														<td className="px-4 py-2 text-center">
															<span
																className={
																	item.is_self_reported
																		? "rounded bg-yellow-100 px-2 py-1 text-xs font-semibold text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
																		: "rounded bg-green-100 px-2 py-1 text-xs font-semibold text-green-800 dark:bg-green-900 dark:text-green-200"
																}
																title={
																	item.is_self_reported
																		? "Self-reported (may be less reliable)"
																		: "Not self-reported (more reliable)"
																}
															>
																{item.is_self_reported
																	? "Yes"
																	: "No"}
															</span>
														</td>
														<td className="px-4 py-2">
															{item.source_link ? (
																<a
																	href={
																		item.source_link
																	}
																	target="_blank"
																	rel="noopener noreferrer"
																	className="group inline-flex items-center text-indigo-600 dark:text-indigo-400"
																>
																	<span className="relative inline-block align-middle truncate text-sm font-normal underline decoration-transparent group-hover:decoration-current transition-colors duration-200">
																		Source
																	</span>
																	<ExternalLink className="ml-1 h-3 w-3 text-indigo-500 opacity-0 transition-all group-hover:opacity-100 group-hover:text-indigo-700 dark:text-indigo-400 dark:group-hover:text-indigo-300" />
																</a>
															) : (
																"-"
															)}
														</td>
													</tr>
												)
											)}
									</React.Fragment>
								);
							})}
						</tbody>
					</table>
				</div>
			) : (
				<p className="text-muted-foreground">
					{search ? "No models match your search." : "No results available for this benchmark yet."}
				</p>
			)}
			{(artificialAnalysis ? visibleArtificialAnalysisRows.length : filteredModels.length) > limit ? <Button variant="outline" size="sm" onClick={() => setLimit((value) => value + 25)}>Show more results ({limit} of {artificialAnalysis ? visibleArtificialAnalysisRows.length : filteredModels.length})</Button> : null}
		</div>
	);
}
