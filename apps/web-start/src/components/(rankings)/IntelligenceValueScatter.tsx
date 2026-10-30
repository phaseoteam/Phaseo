"use client";

import { CartesianGrid, Cell, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import type { PublicIntelligenceValueEntry } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { useLocale, useTranslations } from "next-intl";
import { localizedBenchmarkConfiguration } from "@/i18n/benchmark-display";
import { artificialAnalysisChartColour, artificialAnalysisValueKey, artificialAnalysisValueLabel, formatArtificialAnalysisScore, formatArtificialAnalysisValue } from "@/lib/benchmarks/artificialAnalysis";

export default function IntelligenceValueScatter({ entries }: { entries: PublicIntelligenceValueEntry[] }) {
	const locale = useLocale();
	const t = useTranslations();
	const tValue = useTranslations("Catalogue.rankings.intelligenceValue");
	const configurationLabel = (entry: PublicIntelligenceValueEntry) => artificialAnalysisValueLabel(entry, (variant) => localizedBenchmarkConfiguration(variant, t));

	return <figure className="border-b px-2 py-5 sm:px-5">
		<figcaption className="mb-4 px-3 text-xs text-muted-foreground">{tValue("scatterCaption")}</figcaption>
		<div className="h-80 w-full" role="img" aria-label={tValue("scatterAria")}>
			<ResponsiveContainer width="100%" height="100%">
				<ScatterChart margin={{ top: 10, right: 20, bottom: 25, left: 15 }}>
					<CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
					<XAxis type="number" dataKey="intelligence_score" name={t("Catalogue.rankings.benchmarkMetrics.intelligence")} domain={[0, "auto"]} tick={{ fontSize: 11 }} tickFormatter={(value: number) => new Intl.NumberFormat(locale).format(value)} label={{ value: tValue("intelligenceScore"), position: "bottom", offset: 5 }} />
					<YAxis type="number" dataKey="evaluation_cost" name={t("Catalogue.rankings.benchmarkMetrics.cost")} domain={[0, "auto"]} tickFormatter={(value: number) => formatArtificialAnalysisScore("aa-intelligence-index-cost-v4", value, locale)} tick={{ fontSize: 11 }} width={75} label={{ value: tValue("evaluationCostUsd"), angle: -90, position: "insideLeft", offset: -5, style: { textAnchor: "middle" } }} />
					<Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ active, payload }) => {
						const entry = payload?.[0]?.payload as PublicIntelligenceValueEntry | undefined;
						return active && entry ? <div className="max-w-72 rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-md">
							<p className="font-semibold">{entry.model_name}</p>
							{entry.organisation_name ? <p className="text-muted-foreground">{entry.organisation_name}</p> : null}
							<p className="mt-1 text-muted-foreground">{configurationLabel(entry)}</p>
							<p className="mt-2">{tValue("intelligenceValue", { score: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(entry.intelligence_score) })}</p>
							<p>{tValue("evaluationCostValue", { cost: formatArtificialAnalysisScore("aa-intelligence-index-cost-v4", entry.evaluation_cost, locale) })}</p>
							<p className="mt-1 font-semibold">{tValue("perIntelligencePoint", { cost: formatArtificialAnalysisValue(entry.score, locale) })}</p>
						</div> : null;
					}} />
					<Scatter data={entries} fillOpacity={0.8} isAnimationActive={false}>
						{entries.map((entry) => <Cell key={artificialAnalysisValueKey(entry)} fill={artificialAnalysisChartColour(entry.organisation_id, entry.organisation_colour)} stroke="var(--foreground)" strokeOpacity={0.35} />)}
					</Scatter>
				</ScatterChart>
			</ResponsiveContainer>
		</div>
	</figure>;
}
