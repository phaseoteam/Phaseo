import { ArtificialAnalysisOverview } from "./ArtificialAnalysisOverview";
import { isArtificialAnalysisBenchmark } from "@/lib/benchmarks/artificialAnalysis";
import { isEpochCapabilitiesIndex } from "@/lib/benchmarks/epoch";
import { EpochCapabilitiesOverview } from "./EpochCapabilitiesOverview";
import { BenchmarkBoard } from "./board/BenchmarkBoard";
import type { BenchmarkPage } from "@/lib/fetchers/benchmarks/types";
import type { PublicBenchmarkRanking } from "@/lib/fetchers/frontend/fetchPublicCatalog";

export default function BenchmarkOverview({
	benchmark,
	artificialAnalysisRankings = [],
}: {
	benchmark: BenchmarkPage;
	artificialAnalysisRankings?: PublicBenchmarkRanking[] | Promise<PublicBenchmarkRanking[]>;
}) {
	if (isArtificialAnalysisBenchmark(benchmark.id)) return <ArtificialAnalysisOverview benchmark={benchmark} rankings={artificialAnalysisRankings} />;
	if (isEpochCapabilitiesIndex(benchmark.id)) return <EpochCapabilitiesOverview benchmark={benchmark} />;
	return <BenchmarkBoard benchmark={benchmark} />;
}
