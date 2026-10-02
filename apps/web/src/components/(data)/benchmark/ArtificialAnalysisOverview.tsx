import { useLocale, useTranslations } from "next-intl";
import type { PublicBenchmarkRanking } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import type { BenchmarkPage } from "@/lib/fetchers/benchmarks/types";
import { artificialAnalysisVersion, formatArtificialAnalysisScore, isArtificialAnalysisCostBenchmark } from "@/lib/benchmarks/artificialAnalysis";
import ArtificialAnalysisMetricCharts from "./ArtificialAnalysisMetricCharts";
import BenchmarkProgressChart from "./BenchmarkProgressChart";
import ModelsUsingBenchmark from "./ModelsUsingBenchmark";

export function ArtificialAnalysisOverview({
	benchmark,
	rankings,
}: {
	benchmark: BenchmarkPage;
	rankings: PublicBenchmarkRanking[];
}) {
	const t = useTranslations("Catalogue.benchmarks.current");
	const locale = useLocale();
	const versionOf = (info: unknown) => artificialAnalysisVersion(typeof info === "string" ? info : null) ?? "Unspecified";
	const versions = [...new Set(benchmark.results.map((result) => versionOf(result.other_info)))].sort((a, b) => b.localeCompare(a, "en", { numeric: true }));
	const latestVersion = versions.find((version) => version !== "Unspecified") ?? versions[0] ?? "Unspecified";
	const results = benchmark.results.filter((result) => versionOf(result.other_info) === latestVersion && result.score !== null && Number.isFinite(Number(result.score)));
	const current = { ...benchmark, results };
	const cost = isArtificialAnalysisCostBenchmark(benchmark.id);
	const sorted = [...results].sort((a, b) => cost ? Number(a.score) - Number(b.score) : Number(b.score) - Number(a.score));
	const updated = results.map((result) => result.updated_at).filter((date): date is string => Boolean(date)).sort().at(-1);
	const best = sorted[0];
	const modelCount = new Set(results.map((result) => result.model_id)).size;
	const currentVersionLabel = latestVersion === "Unspecified" ? t("versionUnspecified") : t("indexVersion", {version: latestVersion});

	return (
		<div className="space-y-12 pb-12">
			<section id="summary" className="scroll-mt-36 space-y-5">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<p className="max-w-3xl text-sm text-muted-foreground">{t("aaDescription")}</p>
					<span className="text-xs text-muted-foreground">{currentVersionLabel}</span>
				</div>
				<div className="grid grid-cols-2 overflow-hidden rounded-xl border bg-card lg:grid-cols-4">
					{[
						{ label: t("modelsResults"), value: modelCount.toLocaleString(locale) },
						{ label: cost ? t("lowestCost") : t("highestScore"), value: best ? formatArtificialAnalysisScore(benchmark.id, Number(best.score), locale) : "—" },
						{ label: cost ? t("lowestCostModel") : t("leadingModel"), value: best?.model?.name ?? best?.model_id ?? "—" },
						{ label: t("lastSynced"), value: updated ? new Date(updated).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—" },
					].map((item) => <div key={item.label} className="space-y-2 border-b p-5 odd:border-r lg:border-b-0 lg:border-r lg:last:border-r-0"><p className="text-xs text-muted-foreground">{item.label}</p><p className="truncate text-lg font-semibold tabular-nums" title={item.value}>{item.value}</p></div>)}
				</div>
				<p className="text-xs text-muted-foreground"><a href="https://artificialanalysis.ai/models" target="_blank" rel="noreferrer" className="underline underline-offset-2">{t("source", {brand: "Artificial Analysis"})}</a>. {t("aaResultsNote")}</p>
			</section>

			<ArtificialAnalysisMetricCharts rankings={rankings} />

			<section id="progress" className="scroll-mt-36 space-y-4">
				<div><h2 className="text-xl font-semibold">{t("progress")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("aaProgress")}</p></div>
				<BenchmarkProgressChart benchmark={current} />
			</section>

			<section id="model-results" className="scroll-mt-36"><ModelsUsingBenchmark benchmark={current} /></section>
		</div>
	);
}
