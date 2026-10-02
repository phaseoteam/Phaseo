import { BenchmarkRankingsSection } from "@/components/(rankings)/BenchmarkRankingsSection";
import { fetchFrontendRankingBenchmarks } from "@/lib/fetchers/frontend/fetchRankingSections";
import { RankingUnavailable } from "@/components/(rankings)/RankingUnavailable";
import { getTranslations } from "next-intl/server";

export async function BenchmarkRankingsSectionServer() {
	const t = await getTranslations("Catalogue.rankings");
	const result = await fetchFrontendRankingBenchmarks().catch(() => null);
	if (!result) return <RankingUnavailable id="benchmarks" title={t("intelligenceBenchmarks")} />;
	return <BenchmarkRankingsSection benchmarks={result.benchmarks} />;
}
