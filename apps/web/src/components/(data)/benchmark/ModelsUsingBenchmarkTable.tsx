"use client";

import React from "react";
import Link from "next/link";
import { ChevronRight, ChevronDown, ExternalLink } from "lucide-react";
import { Logo } from "@/components/Logo";

interface ClientProps {
	models: any[]; // flat list of models with provider and benchmark_results
	benchmarkId: string;
	isLowerBetter: boolean;
}

function parseScore(score: string | number): number | null {
	if (typeof score === "number") return score;
	if (typeof score === "string") {
		const match = score.match(/([\d.]+)/);
		if (match) return parseFloat(match[1]);
	}
	return null;
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

export default function ModelsUsingBenchmarkClient({
	models,
	benchmarkId,
	isLowerBetter,
}: ClientProps) {
	const [openRows, setOpenRows] = React.useState<Record<string, boolean>>({});

	function formatScoreDisplay(r: any) {
		const rawScore = r?.score ?? "N/A";
		const isPercentage =
			typeof rawScore === "string" && rawScore.includes("%");
		const parsed = parseScore(rawScore);
		if (parsed !== null)
			return parsed.toFixed(2) + (isPercentage ? "%" : "");
		if (rawScore !== "N/A" && typeof rawScore === "string") return rawScore;
		return rawScore;
	}

	function sortResults(resultsArr: any[], isLowerBetter = false) {
		return [...resultsArr].sort((a, b) => {
			if (a.rank != null && b.rank != null) {
				const diff = a.rank - b.rank;
				if (diff !== 0) return diff;
			}
			const pa = parseScore(a.score ?? "");
			const pb = parseScore(b.score ?? "");
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
			<div>
				<h3 className="text-lg font-semibold">
					Models Using This Benchmark
				</h3>
			</div>
			{models.length > 0 ? (
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
							{models.map((model: any) => {
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
					No models currently using this benchmark in our database.
				</p>
			)}
		</div>
	);
}

