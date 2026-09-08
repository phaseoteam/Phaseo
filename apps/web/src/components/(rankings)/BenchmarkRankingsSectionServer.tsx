import { BenchmarkRankingsSection } from "@/components/(rankings)/BenchmarkRankingsSection";
import { fetchFrontendRankingBenchmarks } from "@/lib/fetchers/frontend/fetchRankingSections";

export async function BenchmarkRankingsSectionServer() {
	const result = await fetchFrontendRankingBenchmarks().catch(() => ({ benchmarks: [] }));
	return <BenchmarkRankingsSection benchmarks={result.benchmarks} />;
}
