import { useLocale, useTranslations } from "next-intl";
import type { PublicBenchmarkRanking } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import type { BenchmarkPage } from "@/lib/fetchers/benchmarks/types";
import { artificialAnalysisVersion, artificialAnalysisMetricKey } from "@/lib/benchmarks/artificialAnalysis";
import { buildArtificialAnalysisExplorer } from "@/lib/benchmarks/artificialAnalysisExplorer";
import ArtificialAnalysisExplorer from "./ArtificialAnalysisExplorer";
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
	const updated = results.map((result) => result.updated_at).filter((date): date is string => Boolean(date)).sort().at(-1);
	const metric = artificialAnalysisMetricKey(benchmark.id);
	const points = buildArtificialAnalysisExplorer(rankings);
	// Web previews can precede the API deployment or encounter older edge payloads.
	const comparisonView = points.some((point) => point.cost !== undefined && point.cost > 0 && point.intelligence !== undefined)
		? "cost-intelligence" : "intelligence";
	const currentVersionLabel = latestVersion === "Unspecified" ? t("versionUnspecified") : t("indexVersion", {version: latestVersion});

	return (
		<div className="space-y-8 pb-12">
			<section id="summary" className="scroll-mt-36 space-y-5">
				<div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
					<p><a href="https://artificialanalysis.ai/models" target="_blank" rel="noreferrer" className="underline underline-offset-2">{t("source", {brand: "Artificial Analysis"})}</a>{updated ? ` · ${t("lastSynced")} ${new Date(updated).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}` : ""}</p>
					<span className="text-xs text-muted-foreground">{currentVersionLabel}</span>
				</div>
			</section>

			<ArtificialAnalysisExplorer points={points} initialView={metric === "coding" || metric === "agentic" || metric === "cost" ? metric : comparisonView} />

			<details id="progress" className="scroll-mt-36 border-t pt-4">
				<summary className="cursor-pointer text-sm font-medium">{t("progress")} · {benchmark.name}</summary>
				<div className="mt-6 space-y-4">
				<div><h2 className="text-xl font-semibold">{t("progress")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("aaProgress")}</p></div>
				<BenchmarkProgressChart benchmark={current} />
				</div>
			</details>

			<details id="model-results" className="scroll-mt-36 border-t pt-4"><summary className="cursor-pointer text-sm font-medium">{t("modelsResults")} · {benchmark.name}</summary><div className="mt-6"><ModelsUsingBenchmark benchmark={current} /></div></details>
		</div>
	);
}
