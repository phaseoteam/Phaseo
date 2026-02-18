import { Card } from "@/components/ui/card";
import Link from "next/link";
import type {
	BenchmarkComparisonChart,
	ModelBenchmarkHighlight,
	ModelBenchmarkResult,
} from "@/lib/fetchers/models/getModelBenchmarkData";
import { ModelBenchmarksGrid } from "./ModelBenchmarksGrid";
import { ModelBenchmarksTable } from "./ModelBenchmarksTable";
import ModelBenchmarksComparison from "./ModelBenchmarksComparison";

type Props = {
	modelId: string;
	highlightCards: ModelBenchmarkHighlight[];
	benchmarkTableData?: Record<string, ModelBenchmarkResult[]>;
	benchmarkComparisonData?: BenchmarkComparisonChart[];
	mode?: "summary" | "full";
};

export default function ModelBenchmarks({
	modelId,
	highlightCards,
	benchmarkTableData,
	benchmarkComparisonData,
	mode = "full",
}: Props) {
	const compareHref = `/compare?models=${encodeURIComponent(modelId)}`;
	const showFull = mode === "full";

	return (
		<div className="space-y-8">
			<section className="space-y-3">
				<div>
					<h2 className="text-xl font-semibold">Highlights</h2>
					<p className="text-sm text-muted-foreground">
						Top benchmark results for {modelId}.
					</p>
				</div>
				{highlightCards.length ? (
					<ModelBenchmarksGrid highlights={highlightCards} />
				) : (
					<Card className="border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
						No benchmark highlights available yet.
					</Card>
				)}
			</section>

			{showFull ? (
				<>
					<section className="space-y-3">
						<div>
							<h2 className="text-xl font-semibold">Benchmark table</h2>
						</div>
						<ModelBenchmarksTable grouped={benchmarkTableData ?? {}} />
					</section>

					<ModelBenchmarksComparison
						comparisons={benchmarkComparisonData ?? []}
					/>
				</>
			) : (
				<div className="rounded-lg border bg-muted/20 p-4 text-sm">
					<p className="text-muted-foreground">
						Detailed benchmark comparisons now live in the Compare tool.
					</p>
					<div className="mt-3 flex flex-wrap gap-2">
						<Link
							href={compareHref}
							className="inline-flex items-center rounded-md border px-3 py-1.5 font-medium hover:bg-accent hover:text-accent-foreground"
						>
							Open Compare Tool
						</Link>
						<Link
							href="/compare"
							className="inline-flex items-center rounded-md border px-3 py-1.5 font-medium hover:bg-accent hover:text-accent-foreground"
						>
							Browse Comparisons
						</Link>
					</div>
				</div>
			)}
		</div>
	);
}
