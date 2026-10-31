import { BenchmarkRankingsSection } from "@/components/(rankings)/BenchmarkRankingsSection";
import { RankingUnavailable } from "@/components/(rankings)/RankingUnavailable";
import { useTranslations } from "@/i18n/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { rankingBenchmarksSectionQuery } from "@/components/(rankings)/rankingSections.queries";

export function BenchmarkRankingsSectionServer() {
	const t = useTranslations("Catalogue.rankings");
	const { data: result } = useSuspenseQuery(rankingBenchmarksSectionQuery());
	if (!result) return <RankingUnavailable id="benchmarks" title={t("intelligenceBenchmarks")} />;
	return <BenchmarkRankingsSection benchmarks={result.benchmarks} intelligenceValue={result.intelligence_value} />;
}
