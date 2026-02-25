"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ExternalLink, ChevronDown, ChevronRight } from "lucide-react";

import type { ModelBenchmarkResult } from "@/lib/fetchers/models/getModelBenchmarkData";

interface ModelBenchmarksTableProps {
	grouped: Record<string, ModelBenchmarkResult[]>;
}

function getScoreDisplay(result: ModelBenchmarkResult) {
	if (result.benchmark.max_score != null && result.score != null) {
		const formatted =
			result.score % 1 === 0
				? result.score.toFixed(0)
				: result.score.toFixed(2);
		return `${formatted}/${result.benchmark.max_score}`;
	}
	return result.score_display || "-";
}

function sortResults(results: ModelBenchmarkResult[]) {
	const isLowerBetter =
		results[0]?.benchmark.order === "lower" ||
		results[0]?.benchmark.ascending_order === false;

	return [...results].sort((a, b) => {
		if (a.rank != null && b.rank != null) {
			const diff = a.rank - b.rank;
			if (diff !== 0) return diff;
		}
		if (a.score != null && b.score != null) {
			return isLowerBetter ? a.score - b.score : b.score - a.score;
		}
		return (a.score_display || "").localeCompare(b.score_display || "");
	});
}

export function ModelBenchmarksTable({ grouped }: ModelBenchmarksTableProps) {
	const [openRows, setOpenRows] = useState<Record<string, boolean>>({});

	if (!Object.keys(grouped).length) {
		return (
			<div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
				No benchmark history recorded for this model yet.
			</div>
		);
	}

	return (
		<div className="mb-12 overflow-x-auto">
			<table className="min-w-full overflow-hidden rounded-2xl border border-zinc-200 text-sm shadow-xs dark:border-zinc-800">
				<thead className="bg-zinc-100 dark:bg-zinc-800">
					<tr>
						<th className="px-4 py-2 text-left">Benchmark</th>
						<th className="px-4 py-2 text-left">Category</th>
						<th className="px-4 py-2 text-left">Top Score</th>
						<th className="px-4 py-2 text-left">Info</th>
						<th className="px-4 py-2 text-center">Self Reported</th>
						<th className="px-4 py-2 text-left">Source</th>
					</tr>
				</thead>
				<tbody>
					{Object.entries(grouped)
						.sort(([a], [b]) => a.localeCompare(b))
						.map(([name, arr]) => {
							const sortedArr = sortResults(arr);
							const top = sortedArr[0];
							const anySelfReported = sortedArr.some(
								(item) => item.is_self_reported
							);
							const hasMultiple = sortedArr.length > 1;
							const isOpen = openRows[name] || false;
							const toggleRow = () =>
								setOpenRows((prev) => ({
									...prev,
									[name]: !isOpen,
								}));

							return (
								<React.Fragment key={name}>
									<tr
										className={`border-t border-zinc-200 dark:border-zinc-800 ${
											hasMultiple && isOpen
												? "rounded-t-xl"
												: "rounded-xl"
										}`}
									>
										<td className="px-4 py-2 font-semibold">
											{hasMultiple && (
												<button
													type="button"
													className="mr-2 inline-flex h-5 w-5 items-center justify-center text-indigo-600 underline decoration-transparent hover:decoration-current transition-colors duration-200 focus:outline-hidden align-middle"
													onClick={toggleRow}
													aria-label={
														isOpen
															? "Hide all scores"
															: "Show all scores"
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
												href={`/benchmarks/${top.benchmark_id}`}
											>
												<span className="relative inline-block align-middle truncate font-semibold underline decoration-transparent hover:decoration-current transition-colors duration-200">
													{name}
												</span>
											</Link>
										</td>
										<td className="px-4 py-2 text-left">
											{top.benchmark.category || "-"}
										</td>
										<td className="px-4 py-2 font-mono">
											{getScoreDisplay(top)}
										</td>
										<td className="px-4 py-2 text-xs text-zinc-500 dark:text-zinc-300">
											{top.other_info || "-"}
										</td>
										<td className="px-4 py-2 text-center">
											<span
												className={
													anySelfReported
														? "rounded bg-yellow-100 px-2 py-1 text-xs font-semibold text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
														: "rounded bg-green-100 px-2 py-1 text-xs font-semibold text-green-800 dark:bg-green-900 dark:text-green-200"
												}
											>
												{anySelfReported ? "Yes" : "No"}
											</span>
										</td>
										<td className="px-4 py-2 text-left">
											{top.source_link ? (
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
										sortedArr.slice(1).map((item, idx) => (
											<tr
												key={`${item.id}-${idx}`}
												className={`border-t border-zinc-200 bg-zinc-50 text-xs dark:border-zinc-800 dark:bg-zinc-900 ${
													idx === sortedArr.length - 2
														? "rounded-b-xl"
														: ""
												}`}
											>
												<td
													className="px-4 py-2 pl-8 font-mono"
													colSpan={2}
												></td>
												<td className="px-4 py-2 font-mono">
													{getScoreDisplay(item)}
												</td>
												<td className="px-4 py-2 text-xs text-zinc-500 dark:text-zinc-300">
													{item.other_info || "-"}
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
														<Link
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
														</Link>
													) : (
														"-"
													)}
												</td>
											</tr>
										))}
								</React.Fragment>
							);
						})}
				</tbody>
			</table>
		</div>
	);
}

