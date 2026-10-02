import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/Logo";
import { HoverCardContent } from "@/components/ui/hover-card";
import { artificialAnalysisValueLabel, formatArtificialAnalysisValue, formatArtificialAnalysisScore } from "@/lib/benchmarks/artificialAnalysis";
import type { PublicIntelligenceValueEntry } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { useLocale, useTranslations } from "next-intl";
import { localizedBenchmarkConfiguration } from "@/i18n/benchmark-display";

export function IntelligenceValueHoverCard({ entry, total }: { entry: PublicIntelligenceValueEntry; total: number }) {
	const locale = useLocale();
	const t = useTranslations();
	const tValue = useTranslations("Catalogue.rankings.intelligenceValue");
	const configurationLabel = (entry: PublicIntelligenceValueEntry) => artificialAnalysisValueLabel(entry, (variant) => localizedBenchmarkConfiguration(variant, t));

	const date = entry.release_date ? new Date(entry.release_date) : null;
	return <HoverCardContent side="top" align="center" className="w-72 rounded-xl p-3">
		<div className="flex items-start gap-2.5">
			<span className="relative size-8 shrink-0 overflow-hidden rounded-md bg-muted"><Logo id={entry.organisation_id ?? entry.model_id} alt="" fill className="object-contain p-1" /></span>
			<div className="min-w-0 flex-1"><Link href={`/models/${entry.model_id}`} className="font-medium leading-5 hover:underline">{entry.model_name}</Link><p className="text-xs text-muted-foreground">{entry.organisation_name ?? t("Catalogue.benchmarks.unknownOrganization")}{date && !Number.isNaN(date.getTime()) ? ` · ${new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date)}` : ""}</p></div>
		</div>
		<div className="mt-3 space-y-1.5 border-t pt-2.5 text-xs">
			<p className="flex justify-between gap-3"><span className="text-muted-foreground">{configurationLabel(entry)}</span><span className="font-medium tabular-nums">{tValue("perPoint", { cost: formatArtificialAnalysisValue(entry.score, locale) })}</span></p>
			<p className="flex justify-between"><span className="text-muted-foreground">{t("Catalogue.rankings.benchmarkMetrics.intelligence")}</span><span>{new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(entry.intelligence_score)}</span></p>
			<p className="flex justify-between"><span className="text-muted-foreground">{t("Catalogue.rankings.benchmarkMetrics.cost")}</span><span>{formatArtificialAnalysisScore("aa-intelligence-index-cost-v4", entry.evaluation_cost, locale)}</span></p>
		</div>
		<p className="mt-2 text-xs text-muted-foreground">{tValue("rankSummary", { rank: entry.rank, total })}</p>
	</HoverCardContent>;
}
