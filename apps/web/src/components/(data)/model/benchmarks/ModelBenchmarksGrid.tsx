import React from "react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import type { ModelBenchmarkHighlight } from "@/lib/fetchers/models/getModelBenchmarkData";

interface ModelBenchmarksGridProps {
	highlights: ModelBenchmarkHighlight[];
}

function sortHighlights(highlights: ModelBenchmarkHighlight[]) {
	return [...highlights].sort((a, b) => {
		const totalA = a.totalModels ?? -1;
		const totalB = b.totalModels ?? -1;
		if (totalA !== totalB) return totalB - totalA;

		const nameA = (a.benchmarkName || "").toLowerCase();
		const nameB = (b.benchmarkName || "").toLowerCase();
		return nameA.localeCompare(nameB);
	});
}

function clampScore(value: number | null | undefined): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return 0;
	return Math.min(100, Math.max(0, value));
}

function ScoreIndicator({
	score,
	isPercentage,
	label,
}: {
	score: number | null;
	isPercentage: boolean;
	label: string;
}) {
	if (!isPercentage || score == null) {
		return (
			<span
				className="h-2.5 w-2.5 rounded-full bg-muted-foreground/45"
				title={`${label} score recorded`}
				aria-label={`${label} score recorded`}
			/>
		);
	}

	const normalizedScore = clampScore(score);

	return (
		<span
			className="relative h-5 w-5 shrink-0 rounded-full"
			style={{
				background: `conic-gradient(var(--primary) ${normalizedScore}%, var(--muted) 0)`,
			}}
			title={`${label}: ${normalizedScore.toFixed(
				normalizedScore % 1 === 0 ? 0 : 1
			)}%`}
			aria-label={`${label}: ${normalizedScore.toFixed(
				normalizedScore % 1 === 0 ? 0 : 1
			)}%`}
		>
			<span className="absolute inset-[4px] rounded-full bg-card" />
		</span>
	);
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
					return (
						<Card
							key={`${highlight.benchmarkId}`}
							className="flex min-h-0 flex-col justify-center rounded-lg border border-border/80 bg-card p-3 text-card-foreground shadow-xs"
							style={{ minHeight: 0 }}
						>
							<div className="flex flex-col gap-1">
								<div className="truncate text-xs font-semibold leading-tight text-card-foreground">
									<Link
										href={`/benchmarks/${highlight.benchmarkId}`}
									>
										<span className="relative truncate font-semibold underline decoration-transparent hover:decoration-current transition-colors duration-200">
											{highlight.benchmarkName ||
												"Unnamed Benchmark"}
										</span>
									</Link>
								</div>
								<div className="flex items-center justify-between font-mono text-base text-foreground">
									<span className="truncate text-sm text-muted-foreground">
										{highlight.scoreDisplay}
									</span>
									<ScoreIndicator
										score={highlight.score}
										isPercentage={highlight.isPercentage}
										label={highlight.benchmarkName}
									/>
								</div>
							</div>
						</Card>
					);
				})}
			</div>
		</div>
	);
}
