import { Link } from "@/i18n/navigation";
import type { PublicIntelligenceValueEntry } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { useLocale, useTranslations } from "@/i18n/react";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { localizedBenchmarkConfiguration } from "@/i18n/benchmark-display";
import { artificialAnalysisValueKey, artificialAnalysisValueLabel, formatArtificialAnalysisScore, formatArtificialAnalysisValue } from "@/lib/benchmarks/artificialAnalysis";

export function IntelligenceValueTable({ entries }: { entries: PublicIntelligenceValueEntry[] }) {
	const locale = useLocale();
	const t = useTranslations();
	const tValue = useTranslations("Catalogue.rankings.intelligenceValue");
	const configurationLabel = (entry: PublicIntelligenceValueEntry) => artificialAnalysisValueLabel(entry, (variant) => localizedBenchmarkConfiguration(variant, t));

	return <div className="overflow-x-auto">
		<Table wrapInContainer={false} className="w-full text-left text-sm">
			<TableCaption className="sr-only">{tValue("tableCaption")}</TableCaption>
			<TableHeader className="border-b bg-muted/30 text-xs text-muted-foreground [&_tr]:border-0">
				<TableRow className="hover:bg-transparent dark:hover:bg-transparent">
					<TableHead scope="col" className="h-auto font-bold text-inherit dark:text-inherit px-5 py-3">{t("Catalogue.rankings.rankColumn")}</TableHead>
					<TableHead scope="col" className="h-auto font-bold text-inherit dark:text-inherit px-3 py-3">{tValue("modelConfiguration")}</TableHead>
					<TableHead scope="col" className="h-auto font-bold text-inherit dark:text-inherit px-3 py-3 text-right">{t("Catalogue.rankings.benchmarkMetrics.intelligence")}</TableHead>
					<TableHead scope="col" className="h-auto font-bold text-inherit dark:text-inherit px-3 py-3 text-right">{tValue("evaluationCostShort")}</TableHead>
					<TableHead scope="col" className="h-auto font-bold text-inherit dark:text-inherit px-5 py-3 text-right">{tValue("usdPerPointColumn")}</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody className="divide-y">
				{entries.map((entry) => <TableRow key={artificialAnalysisValueKey(entry)}>
					<TableCell className="px-5 py-4 tabular-nums text-muted-foreground">{new Intl.NumberFormat(locale).format(entry.rank)}</TableCell>
					<TableHead scope="row" className="h-auto text-inherit dark:text-inherit min-w-52 px-3 py-4 font-normal">
						<Link href={`/models/${entry.model_id}`} className="font-medium hover:underline">{entry.model_name}</Link>
						<p className="mt-1 text-xs text-muted-foreground">{configurationLabel(entry)}</p>
					</TableHead>
					<TableCell className="px-3 py-4 text-right tabular-nums">{new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(entry.intelligence_score)}</TableCell>
					<TableCell className="px-3 py-4 text-right tabular-nums">{formatArtificialAnalysisScore("aa-intelligence-index-cost-v4", entry.evaluation_cost, locale)}</TableCell>
					<TableCell className="px-5 py-4 text-right font-semibold tabular-nums" title={String(entry.score)}>{formatArtificialAnalysisValue(entry.score, locale)}</TableCell>
				</TableRow>)}
			</TableBody>
		</Table>
	</div>;
}
