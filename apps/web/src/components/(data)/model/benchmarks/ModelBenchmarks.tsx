import { Card } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type {
	ModelBenchmarkHighlight,
	ModelBenchmarkResult,
} from "@/lib/fetchers/models/getModelBenchmarkData";
import type { PublicBenchmarkRanking } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { ModelBenchmarksGrid } from "./ModelBenchmarksGrid";
import { ModelBenchmarksTable } from "./ModelBenchmarksTable";
import { isArtificialAnalysisBenchmark } from "@/lib/benchmarks/artificialAnalysis";
import { ArtificialAnalysisBenchmarks } from "./ArtificialAnalysisBenchmarks";

type Props = {
	highlightCards: ModelBenchmarkHighlight[];
	benchmarkTableData?: Record<string, ModelBenchmarkResult[]>;
	benchmarkResults?: ModelBenchmarkResult[];
	benchmarkRankings?: PublicBenchmarkRanking[];
	modelId?: string;
	mode?: "summary" | "full";
};

export default function ModelBenchmarks({
	highlightCards,
	benchmarkTableData,
	benchmarkResults = [],
	benchmarkRankings = [],
	modelId,
	mode = "full",
}: Props) {
	const showFull = mode === "full";
	const otherHighlights = highlightCards.filter(
		(item) => !isArtificialAnalysisBenchmark(item.benchmarkId),
	);
	const hasArtificialAnalysis = highlightCards.some((item) => isArtificialAnalysisBenchmark(item.benchmarkId) && item.score !== null);
	const otherBenchmarks = otherHighlights.length ? (
		<ModelBenchmarksGrid highlights={otherHighlights} />
	) : (
		<Card className="border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
			No benchmark highlights available yet.
		</Card>
	);

	return (
		<div className="space-y-8">
			<ArtificialAnalysisBenchmarks highlights={highlightCards} results={benchmarkResults} rankings={benchmarkRankings} modelId={modelId} />
			{otherHighlights.length > 0 || !hasArtificialAnalysis ? (
				hasArtificialAnalysis ? (
					<section aria-label="Other Benchmarks">
						<Accordion className="border-t" type="single">
							<AccordionItem value="other-benchmarks" className="border-0">
								<AccordionTrigger className="py-4 text-lg font-semibold hover:no-underline">Other Benchmarks</AccordionTrigger>
								<AccordionContent className="pt-1">{otherBenchmarks}</AccordionContent>
							</AccordionItem>
						</Accordion>
					</section>
				) : (
					<section>{otherBenchmarks}</section>
				)
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
