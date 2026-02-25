import React from "react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import type { ModelBenchmarkHighlight } from "@/lib/fetchers/models/getModelBenchmarkData";

interface ModelBenchmarksGridProps {
	highlights: ModelBenchmarkHighlight[];
}

function getRankBadgeClasses(rank: number | null | undefined) {
	if (typeof rank !== "number" || rank <= 0) {
		return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
	}

	if (rank === 1) return "bg-yellow-400 text-yellow-900";
	if (rank === 2) return "bg-gray-300 text-gray-800";
	if (rank === 3) return "bg-amber-700 text-amber-100";

	return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
}

function sortHighlights(highlights: ModelBenchmarkHighlight[]) {
	return [...highlights].sort((a, b) => {
		const nameA = (a.benchmarkName || "").toLowerCase();
		const nameB = (b.benchmarkName || "").toLowerCase();
		const nameCompare = nameA.localeCompare(nameB);
		if (nameCompare !== 0) return nameCompare;

		// Fallback to rank (ascending), then totalModels (descending) to keep a deterministic order
		const rankA = a.rank ?? Number.POSITIVE_INFINITY;
		const rankB = b.rank ?? Number.POSITIVE_INFINITY;
		if (rankA !== rankB) return rankA - rankB;

		const totalA = a.totalModels ?? -1;
		const totalB = b.totalModels ?? -1;
		if (totalA !== totalB) return totalB - totalA;

		return 0;
	});
}

export function ModelBenchmarksGrid({ highlights }: ModelBenchmarksGridProps) {
	if (!highlights.length) {
		return (
			<div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
				No benchmark results available for this model yet.
			</div>
		);
	}

	const sorted = sortHighlights(highlights);

	return (
		<div className="mb-8 w-full">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
				{sorted.map((highlight) => {
					const rankClass = getRankBadgeClasses(highlight.rank);

					return (
						<Card
							key={`${highlight.benchmarkId}`}
							className="flex min-h-0 flex-col justify-center rounded-lg border border-gray-200 border-b-2 border-b-gray-300 bg-white p-3 dark:border-gray-700 dark:border-b-gray-600"
							style={{ minHeight: 0 }}
						>
							<div className="flex flex-col gap-1">
								<div className="truncate text-xs font-semibold leading-tight text-zinc-800 dark:text-zinc-100">
									<Link
										href={`/benchmarks/${highlight.benchmarkId}`}
									>
										<span className="relative truncate font-semibold underline decoration-transparent hover:decoration-current transition-colors duration-200">
											{highlight.benchmarkName ||
												"Unnamed Benchmark"}
										</span>
									</Link>
								</div>
								<div className="flex items-center justify-between font-mono text-base">
									<span>{highlight.scoreDisplay}</span>
									<span
										className={`ml-2 min-w-12 rounded px-2 py-0.5 text-center text-xs font-bold ${rankClass}`}
										title={
											typeof highlight.totalModels ===
											"number"
												? `Rank among ${highlight.totalModels} models`
												: undefined
										}
									>
										{highlight.rank != null
											? `#${highlight.rank}`
											: "-"}
									</span>
								</div>
							</div>
						</Card>
					);
				})}
			</div>
		</div>
	);
}
