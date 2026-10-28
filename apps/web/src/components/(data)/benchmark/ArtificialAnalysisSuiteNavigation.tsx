import { Link } from "@/i18n/navigation";
import type { ArtificialAnalysisSuite } from "@/lib/fetchers/benchmarks/types";

/** Index version switcher; metric choice lives in the explorer tabs. */
export default function ArtificialAnalysisSuiteNavigation({ suite, selectedId, currentLabel }: { suite: ArtificialAnalysisSuite; selectedId: string; currentLabel?: string }) {
	const selected = suite.metrics.find((metric) => metric.id === selectedId);
	const href = (metric: string, version: number) => `/benchmarks/${suite.id}?metric=${metric}${version === suite.current_version ? "" : `&version=${version}`}`;
	return <nav aria-label="Artificial Analysis" className="flex flex-wrap items-center gap-3">
		{suite.versions.map((version) => version === suite.selected_version
			? <Link key={version} href={href(selected?.key ?? "intelligence", version)} aria-current="page" className="rounded-md bg-muted px-3 py-2 text-sm font-medium text-foreground">{currentLabel ?? `v${version}`}</Link>
			: <Link key={version} href={href(selected?.key ?? "intelligence", version)} className="rounded-md px-3 py-2 text-sm hover:bg-muted hover:text-foreground">v{version}</Link>)}
	</nav>;
}
