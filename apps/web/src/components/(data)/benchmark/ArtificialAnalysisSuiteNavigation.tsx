import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import type { ArtificialAnalysisSuite } from "@/lib/fetchers/benchmarks/types";

export default async function ArtificialAnalysisSuiteNavigation({ suite, selectedId, showMetrics = true }: { suite: ArtificialAnalysisSuite; selectedId: string; showMetrics?: boolean }) {
	const t = await getTranslations("Catalogue.rankings");
	const tOther = await getTranslations("Catalogue.models.detail.benchmarkGrid");
	const selected = suite.metrics.find((metric) => metric.id === selectedId);
	const href = (metric: string, version: number) => `/benchmarks/${suite.id}?metric=${metric}${version === suite.current_version ? "" : `&version=${version}`}`;
	return <div className={showMetrics ? "mb-6 space-y-3" : "mb-4 flex flex-wrap items-center justify-between gap-3"}>
		{showMetrics ? <nav aria-label="Artificial Analysis" className="flex flex-wrap gap-2">
			{suite.metrics.filter((metric) => metric.total_models > 0).map((metric) => <Link key={metric.key} href={href(metric.key, suite.selected_version)} aria-current={metric.id === selectedId ? "page" : undefined} className={`rounded-md border px-3 py-2 text-sm ${metric.id === selectedId ? "bg-muted font-medium" : "hover:bg-muted/50"}`}>{t(`benchmarkMetrics.${metric.key}`)}</Link>)}
		</nav> : null}
		<div className="flex flex-wrap items-center gap-3 text-sm">
			{suite.versions.map((version) => <Link key={version} href={href(version === suite.selected_version ? selected?.key ?? "intelligence" : "intelligence", version)} aria-current={version === suite.selected_version ? "page" : undefined} className={version === suite.selected_version ? "font-medium" : "text-muted-foreground hover:underline"}>v{version}</Link>)}
		</div>
		{suite.other_evaluations.length ? <details className="text-sm text-muted-foreground">
			<summary className="w-fit cursor-pointer">{tOther("otherBenchmarks")}</summary>
			<div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">{suite.other_evaluations.map((evaluation) => <Link key={evaluation.id} href={`/benchmarks/${evaluation.id}`} className="hover:underline">{evaluation.name}</Link>)}</div>
		</details> : null}
	</div>;
}
