import { BenchmarkRankingsSection } from "@/components/(rankings)/BenchmarkRankingsSection";
import { fetchFrontendRankingBenchmarks } from "@/lib/fetchers/frontend/fetchRankingSections";
import { RankingUnavailable } from "@/components/(rankings)/RankingUnavailable";

export async function BenchmarkRankingsSectionServer() {
	const result = await fetchFrontendRankingBenchmarks().catch(() => null);
	if (!result) return <RankingUnavailable id="benchmarks" title="Intelligence Benchmarks" />;
	return <BenchmarkRankingsSection benchmarks={result.benchmarks} />;
}
