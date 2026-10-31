import { use } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSuspenseQuery } from "@tanstack/react-query";
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
import ArtificialAnalysisDashboard from "./ArtificialAnalysisDashboard";
import { dashboardRows } from "@/lib/benchmarks/artificialAnalysisDashboard";
import { artificialAnalysisDashboardDataQuery } from "./ArtificialAnalysisOverview.queries";
import { ArtificialAnalysisDeferredExplorer } from "./ArtificialAnalysisDeferredExplorer";

export function ArtificialAnalysisOverview({
	benchmark,
	rankings: rankingsPromise,
}: {
	benchmark: BenchmarkPage;
	rankings: PublicBenchmarkRanking[] | Promise<PublicBenchmarkRanking[]>;
}) {
	const major = Number(benchmark.id.match(/-v(\d+)$/)?.[1]);
	const { data: publicData } = useSuspenseQuery(artificialAnalysisDashboardDataQuery(Number.isSafeInteger(major) && major > 0 ? major : null));
	const t = useTranslations("Catalogue.benchmarks.current");
	const tOther = useTranslations("Catalogue.models.detail.benchmarkGrid");
	const tBenchmarks = useTranslations("Catalogue.benchmarks");
	const locale = useLocale();
	// Accepts resolved rankings; a promise (Next server prop) is still unwrapped.
	const rankings = Array.isArray(rankingsPromise) ? rankingsPromise : use(rankingsPromise);
	const versionOf = (info: unknown) => artificialAnalysisVersion(typeof info === "string" ? info : null) ?? "Unspecified";
	const versions = [...new Set(benchmark.results.map((result) => versionOf(result.other_info)))].sort((a, b) => b.localeCompare(a, "en", { numeric: true }));
	const latestVersion = versions.find((version) => version !== "Unspecified") ?? versions[0] ?? "Unspecified";
	const richData = publicData?.methodology_version === latestVersion ? publicData : null;
	const results = benchmark.results.filter((result) => versionOf(result.other_info) === latestVersion && result.score !== null && Number.isFinite(Number(result.score)));
	const { comparison_benchmarks: _comparisons, suite: _suite, ...currentBenchmark } = benchmark;
	const current = { ...currentBenchmark, results };
	const updated = richData?.fetched_at ?? results.map((result) => result.updated_at).filter((date): date is string => Boolean(date)).sort().at(-1);
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
			<span>{currentVersionLabel}</span>
			{updated ? <span>{t("lastSynced")} {new Date(updated).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</span> : null}
		</div>
	</div>;

	return (
		<div className="pb-12">
			{benchmark.suite ? <div className="border-b px-4 py-2 lg:px-6"><ArtificialAnalysisSuiteNavigation suite={benchmark.suite} selectedId={benchmark.id} currentLabel={latestVersion === "Unspecified" ? undefined : `v${latestVersion}`} /></div> : null}
			{richData ? <ArtificialAnalysisDashboard rows={dashboardRows(richData.models)} footer={footer} /> : <ArtificialAnalysisExplorer points={points} footer={footer} initialView={metric === "coding" || metric === "agentic" || metric === "cost" ? metric : comparisonView} />}
			<div className="border-b px-4 lg:px-6">
				{richData ? <ArtificialAnalysisDeferredExplorer title={tBenchmarks("tocIndexComparisons")} points={points} /> : null}
				<BenchmarkDisclosure id="progress" title={t("progress")}><BenchmarkProgressChart benchmark={current} /></BenchmarkDisclosure>
				<BenchmarkDisclosure id="model-results" title={t("modelsResults")}><ModelsUsingBenchmark benchmark={current} /></BenchmarkDisclosure>
				{otherEvaluations.length ? <BenchmarkDisclosure title={tOther("otherBenchmarks")} count={otherEvaluations.length.toLocaleString(locale)}>
					<ul className="flex flex-wrap gap-2">{otherEvaluations.map((evaluation) => <li key={evaluation.id}><Link href={`/benchmarks/${evaluation.id}`} className="inline-flex rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-muted">{evaluation.name}</Link></li>)}</ul>
				</BenchmarkDisclosure> : null}
			</div>
		</div>
	);
}
