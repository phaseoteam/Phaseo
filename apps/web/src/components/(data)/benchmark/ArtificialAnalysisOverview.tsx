import { useLocale, useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { PublicBenchmarkRanking } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import type { BenchmarkPage } from "@/lib/fetchers/benchmarks/types";
import { artificialAnalysisVersion, artificialAnalysisMetricKey } from "@/lib/benchmarks/artificialAnalysis";
import { buildArtificialAnalysisExplorer } from "@/lib/benchmarks/artificialAnalysisExplorer";
import ArtificialAnalysisExplorer from "./ArtificialAnalysisExplorer";
import ArtificialAnalysisSuiteNavigation from "./ArtificialAnalysisSuiteNavigation";
import { BenchmarkDisclosure } from "./BenchmarkDisclosure";
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
	const tOther = useTranslations("Catalogue.models.detail.benchmarkGrid");
	const locale = useLocale();
	const versionOf = (info: unknown) => artificialAnalysisVersion(typeof info === "string" ? info : null) ?? "Unspecified";
	const versions = [...new Set(benchmark.results.map((result) => versionOf(result.other_info)))].sort((a, b) => b.localeCompare(a, "en", { numeric: true }));
	const latestVersion = versions.find((version) => version !== "Unspecified") ?? versions[0] ?? "Unspecified";
	const results = benchmark.results.filter((result) => versionOf(result.other_info) === latestVersion && result.score !== null && Number.isFinite(Number(result.score)));
	const current = { ...benchmark, results };
	const updated = results.map((result) => result.updated_at).filter((date): date is string => Boolean(date)).sort().at(-1);
	const metric = artificialAnalysisMetricKey(benchmark.id);
	const points = buildArtificialAnalysisExplorer(rankings);
	// Web previews can precede the API deployment or encounter older edge payloads.
	const comparisonView = points.some((point) => point.cost !== undefined && point.cost > 0 && point.intelligence !== undefined)
		? "cost-intelligence" : "intelligence";
	const currentVersionLabel = latestVersion === "Unspecified" ? t("versionUnspecified") : t("indexVersion", {version: latestVersion});
	const otherEvaluations = benchmark.suite?.other_evaluations ?? [];

	// Source, version and freshness live in one row under the chart instead of floating above it.
	const footer = <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4 text-xs text-muted-foreground">
		<a href="https://artificialanalysis.ai/models" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">{t("source", {brand: "Artificial Analysis"})}<ArrowUpRight className="size-3.5" /></a>
		<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
			{benchmark.suite ? <ArtificialAnalysisSuiteNavigation suite={benchmark.suite} selectedId={benchmark.id} currentLabel={currentVersionLabel} /> : <span>{currentVersionLabel}</span>}
			{updated ? <span>{t("lastSynced")} {new Date(updated).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</span> : null}
		</div>
	</div>;

	return (
		<div className="pb-12">
			<ArtificialAnalysisExplorer points={points} footer={footer} initialView={metric === "coding" || metric === "agentic" || metric === "cost" ? metric : comparisonView} />
			<div className="border-b">
				<BenchmarkDisclosure id="progress" title={t("progress")}><BenchmarkProgressChart benchmark={current} /></BenchmarkDisclosure>
				<BenchmarkDisclosure id="model-results" title={t("modelsResults")}><ModelsUsingBenchmark benchmark={current} /></BenchmarkDisclosure>
				{otherEvaluations.length ? <BenchmarkDisclosure title={tOther("otherBenchmarks")} count={otherEvaluations.length.toLocaleString(locale)}>
					<ul className="flex flex-wrap gap-2">{otherEvaluations.map((evaluation) => <li key={evaluation.id}><Link href={`/benchmarks/${evaluation.id}`} className="inline-flex rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-muted">{evaluation.name}</Link></li>)}</ul>
				</BenchmarkDisclosure> : null}
			</div>
		</div>
	);
}
