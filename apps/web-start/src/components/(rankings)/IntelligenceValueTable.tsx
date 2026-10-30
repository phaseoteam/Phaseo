import { Link } from "@/i18n/navigation";
import type { PublicIntelligenceValueEntry } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { useLocale, useTranslations } from "next-intl";
import { localizedBenchmarkConfiguration } from "@/i18n/benchmark-display";
import { artificialAnalysisValueKey, artificialAnalysisValueLabel, formatArtificialAnalysisScore, formatArtificialAnalysisValue } from "@/lib/benchmarks/artificialAnalysis";

export function IntelligenceValueTable({ entries }: { entries: PublicIntelligenceValueEntry[] }) {
	const locale = useLocale();
	const t = useTranslations();
	const tValue = useTranslations("Catalogue.rankings.intelligenceValue");
	const configurationLabel = (entry: PublicIntelligenceValueEntry) => artificialAnalysisValueLabel(entry, (variant) => localizedBenchmarkConfiguration(variant, t));

	return <div className="overflow-x-auto">
		<table className="w-full text-left text-sm">
			<caption className="sr-only">{tValue("tableCaption")}</caption>
			<thead className="border-b bg-muted/30 text-xs text-muted-foreground">
				<tr>
					<th scope="col" className="px-5 py-3">{t("Catalogue.rankings.rankColumn")}</th>
					<th scope="col" className="px-3 py-3">{tValue("modelConfiguration")}</th>
					<th scope="col" className="px-3 py-3 text-right">{t("Catalogue.rankings.benchmarkMetrics.intelligence")}</th>
					<th scope="col" className="px-3 py-3 text-right">{tValue("evaluationCostShort")}</th>
					<th scope="col" className="px-5 py-3 text-right">{tValue("usdPerPointColumn")}</th>
				</tr>
			</thead>
			<tbody className="divide-y">
				{entries.map((entry) => <tr key={artificialAnalysisValueKey(entry)}>
					<td className="px-5 py-4 tabular-nums text-muted-foreground">{new Intl.NumberFormat(locale).format(entry.rank)}</td>
					<th scope="row" className="min-w-52 px-3 py-4 font-normal">
						<Link href={`/models/${entry.model_id}`} className="font-medium hover:underline">{entry.model_name}</Link>
						<p className="mt-1 text-xs text-muted-foreground">{configurationLabel(entry)}</p>
					</th>
					<td className="px-3 py-4 text-right tabular-nums">{new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(entry.intelligence_score)}</td>
					<td className="px-3 py-4 text-right tabular-nums">{formatArtificialAnalysisScore("aa-intelligence-index-cost-v4", entry.evaluation_cost, locale)}</td>
					<td className="px-5 py-4 text-right font-semibold tabular-nums" title={String(entry.score)}>{formatArtificialAnalysisValue(entry.score, locale)}</td>
				</tr>)}
			</tbody>
		</table>
	</div>;
}
