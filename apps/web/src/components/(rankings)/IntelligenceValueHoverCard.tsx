import { artificialAnalysisValueLabel, formatArtificialAnalysisValue, formatArtificialAnalysisScore } from "@/lib/benchmarks/artificialAnalysis";
import type { PublicIntelligenceValueEntry } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { useLocale, useTranslations } from "@/i18n/react";
import { localizedBenchmarkConfiguration } from "@/i18n/benchmark-display";
import { BenchmarkScoreHoverCardContent } from "@/components/(data)/model/benchmarks/BenchmarkScoreHoverCard";

export function IntelligenceValueHoverCard({ entry, total }: { entry: PublicIntelligenceValueEntry; total: number }) {
	const locale = useLocale();
	const t = useTranslations();
	const tValue = useTranslations("Catalogue.rankings.intelligenceValue");
	const tCard = useTranslations("Catalogue.hoverCards");
	const date = entry.release_date ? new Date(entry.release_date) : null;
	return (
		<BenchmarkScoreHoverCardContent
			modelId={entry.model_id}
			modelName={entry.model_name}
			logoId={entry.organisation_id ?? entry.model_id}
			meta={[
				entry.organisation_name ?? t("Catalogue.benchmarks.unknownOrganization"),
				date && !Number.isNaN(date.getTime())
					? new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date)
					: null,
			]}
			score={tValue("perPoint", { cost: formatArtificialAnalysisValue(entry.score, locale) })}
			rows={[
				{ key: "configuration", label: tCard("rowConfiguration"), value: artificialAnalysisValueLabel(entry, (variant) => localizedBenchmarkConfiguration(variant, t)) },
				{ key: "rank", label: tCard("rowRank"), value: tCard("rankValue", { rank: entry.rank, total }) },
				{ key: "intelligence", label: t("Catalogue.rankings.benchmarkMetrics.intelligence"), value: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(entry.intelligence_score) },
				{ key: "cost", label: t("Catalogue.rankings.benchmarkMetrics.cost"), value: formatArtificialAnalysisScore("aa-intelligence-index-cost-v4", entry.evaluation_cost, locale) },
			]}
		/>
	);
}
