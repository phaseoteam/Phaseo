import { Card } from "@/components/ui/card";
import type {
	ModelBenchmarkHighlight,
	ModelBenchmarkResult,
} from "@/lib/fetchers/models/getModelBenchmarkData";
import { ModelBenchmarksGrid } from "./ModelBenchmarksGrid";
import { ModelBenchmarksTable } from "./ModelBenchmarksTable";
import {
	ArtificialAnalysisBenchmarks,
	isArtificialAnalysisBenchmark,
} from "./ArtificialAnalysisBenchmarks";

type Props = {
	highlightCards: ModelBenchmarkHighlight[];
	benchmarkTableData?: Record<string, ModelBenchmarkResult[]>;
	mode?: "summary" | "full";
};

export default function ModelBenchmarks({
	highlightCards,
	benchmarkTableData,
	mode = "full",
}: Props) {
	const showFull = mode === "full";
	const otherHighlights = highlightCards.filter(
		(item) => !isArtificialAnalysisBenchmark(item.benchmarkId),
	);
	const hasArtificialAnalysis = highlightCards.some((item) => isArtificialAnalysisBenchmark(item.benchmarkId) && item.score !== null);

	return (
		<div className="space-y-8">
			<ArtificialAnalysisBenchmarks highlights={highlightCards} />
			{otherHighlights.length > 0 || !hasArtificialAnalysis ? (
				<section className="space-y-3">
					{hasArtificialAnalysis ? (
						<h2 className="text-lg font-semibold">Other benchmarks</h2>
					) : null}
					{otherHighlights.length ? (
						<ModelBenchmarksGrid highlights={otherHighlights} />
					) : (
						<Card className="border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
							No benchmark highlights available yet.
						</Card>
					)}
				</section>
			) : null}

			{showFull ? (
				<>
					<section className="space-y-3">
						<div>
							<h2 className="text-xl font-semibold">Benchmark table</h2>
						</div>
						<ModelBenchmarksTable grouped={benchmarkTableData ?? {}} />
					</section>
				</>
			) : null}
		</div>
	);
}
