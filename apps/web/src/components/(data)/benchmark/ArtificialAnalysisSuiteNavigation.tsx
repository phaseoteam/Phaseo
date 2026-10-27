import { Link } from "@/i18n/navigation";
import type { ArtificialAnalysisSuite } from "@/lib/fetchers/benchmarks/types";

/** Index version switcher; metric choice lives in the explorer tabs. */
export default function ArtificialAnalysisSuiteNavigation({ suite, selectedId, currentLabel }: { suite: ArtificialAnalysisSuite; selectedId: string; currentLabel?: string }) {
	const selected = suite.metrics.find((metric) => metric.id === selectedId);
	const href = (metric: string, version: number) => `/benchmarks/${suite.id}?metric=${metric}${version === suite.current_version ? "" : `&version=${version}`}`;
	return <nav aria-label="Artificial Analysis" className="flex flex-wrap items-center gap-3">
		{suite.versions.map((version) => version === suite.selected_version
			? <Link key={version} href={href(selected?.key ?? "intelligence", version)} aria-current="page" className="font-medium text-foreground">{currentLabel ?? `v${version}`}</Link>
			: <Link key={version} href={href("intelligence", version)} className="hover:text-foreground hover:underline">v{version}</Link>)}
	</nav>;
}
