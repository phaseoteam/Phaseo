import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import type { ArtificialAnalysisSuite } from "@/lib/fetchers/benchmarks/types";

export default async function ArtificialAnalysisSuiteNavigation({ suite, selectedId }: { suite: ArtificialAnalysisSuite; selectedId: string }) {
	const t = await getTranslations("Catalogue.rankings");
	const selected = suite.metrics.find((metric) => metric.id === selectedId);
	const href = (metric: string, version: number) => `/benchmarks/${suite.id}?metric=${metric}${version === suite.current_version ? "" : `&version=${version}`}`;
	return <div className="mb-6 space-y-3">
		<nav aria-label="Artificial Analysis" className="flex flex-wrap gap-2">
			{suite.metrics.filter((metric) => metric.total_models > 0).map((metric) => <Link key={metric.key} href={href(metric.key, suite.selected_version)} aria-current={metric.id === selectedId ? "page" : undefined} className={`rounded-md border px-3 py-2 text-sm ${metric.id === selectedId ? "bg-muted font-medium" : "hover:bg-muted/50"}`}>{t(`benchmarkMetrics.${metric.key}`)}</Link>)}
		</nav>
		<div className="flex flex-wrap items-center gap-3 text-sm">
			{suite.versions.map((version) => <Link key={version} href={href(version === suite.selected_version ? selected?.key ?? "intelligence" : "intelligence", version)} aria-current={version === suite.selected_version ? "page" : undefined} className={version === suite.selected_version ? "font-medium" : "text-muted-foreground hover:underline"}>v{version}</Link>)}
			{suite.other_evaluations.map((evaluation) => <Link key={evaluation.id} href={`/benchmarks/${evaluation.id}`} className="text-muted-foreground hover:underline">{evaluation.name}</Link>)}
		</div>
	</div>;
}
