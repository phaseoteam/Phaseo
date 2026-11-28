import { useMemo, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { useLocale, useTranslations } from "@/i18n/react";
import { Callout } from "@/components/ui/callout";
import type { BenchmarkPage } from "@/lib/fetchers/benchmarks/types";
import { benchmarkFreshness, boardSourceLink, buildLeaderboard, chartAxes, normalizeCategory, toBoardRows, unitKind, unitLabel, utcDateFormat } from "@/lib/benchmarks/boardResults";
import { BenchmarkBoardChart } from "./BenchmarkBoardChart";
import { BenchmarkLeaderboard } from "./BenchmarkLeaderboard";

/** The benchmark page for any leaderboard that isn't one of the dedicated dashboards. */
export function BenchmarkBoard({ benchmark }: { benchmark: BenchmarkPage }) {
	const t = useTranslations("Catalogue.benchmarks.board");
	const categoryT = useTranslations("Catalogue.benchmarks.categories");
	const locale = useLocale();
	const rows = useMemo(() => toBoardRows(benchmark), [benchmark]);
	const higherIsBetter = benchmark.ascending_order !== false;
	const scale = { unit: benchmark.unit ?? null, type: benchmark.type ?? null, higherIsBetter };
	const entries = useMemo(() => buildLeaderboard(rows, { higherIsBetter }), [rows, higherIsBetter]);
	const sources = benchmark.sources ?? [];
	const source = sources.find((item) => item.id === benchmark.source_id)
		?? [...sources].sort((a, b) => rows.filter((row) => row.sourceId === b.id).length - rows.filter((row) => row.sourceId === a.id).length)[0];
	const outbound = boardSourceLink(benchmark.link, source);
	const updated = benchmarkFreshness(source?.last_success_at, rows.map((row) => row.observedOn), benchmark.results.map((result) => result.updated_at ?? result.created_at));
	const category = normalizeCategory(benchmark.category);
	const kind = unitKind(scale);
	const label = unitLabel(scale);
	const unitText = kind === "percent" ? "%" : kind === "usd" ? "USD" : kind === "seconds" ? t("unitSeconds") : label ?? benchmark.unit ?? null;
	const axes = chartAxes(entries.map((entry) => entry.best));
	const facts: Array<{ label: string; value: ReactNode }> = [
		{ label: t("direction"), value: <>{higherIsBetter ? t("higherIsBetter") : t("lowerIsBetter")}{unitText ? <span className="text-muted-foreground"> ({unitText})</span> : null}</> },
		{ label: t("category"), value: categoryT(category) },
		{ label: t("models"), value: new Intl.NumberFormat(locale).format(entries.length) },
		{ label: t("lastUpdated"), value: updated ? utcDateFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(updated) : "—" },
	];

	return (
		<div className="space-y-10 pb-12">
			<section id="summary" className="scroll-mt-36 space-y-5">
				{benchmark.description ? <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{benchmark.description}</p> : null}
				<dl className="grid grid-cols-2 border-y sm:grid-cols-4">
					{facts.map((fact, index) => (
						<div key={fact.label} className={`min-w-0 py-3 ${index % 2 ? "border-l pl-4" : "pr-4"} ${index > 1 ? "border-t sm:border-t-0" : ""} sm:border-l sm:pl-4 sm:first:border-l-0 sm:first:pl-0`}>
							<dt className="text-xs text-muted-foreground">{fact.label}</dt>
							<dd className="mt-1 truncate text-sm font-medium">{fact.value}</dd>
						</div>
					))}
				</dl>
				{source || outbound ? (
					<div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs text-muted-foreground">
						<p>{source?.attribution ?? (source ? t("dataFrom", { publisher: source.publisher ?? source.name }) : null)}</p>
						{outbound ? (
							<a href={outbound.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-foreground hover:underline">
								{outbound.sourceName ? t("openSourceNamed", { source: outbound.sourceName }) : t("openSource")}
								<ArrowUpRight className="size-3.5" />
							</a>
						) : null}
					</div>
				) : null}
			</section>

			{entries.length ? (
				<>
					{axes.length ? (
						<section id="progress" className="scroll-mt-36">
							<BenchmarkBoardChart entries={entries} scale={scale} axes={axes} />
						</section>
					) : null}
					<section id="model-results" className="scroll-mt-36">
						<BenchmarkLeaderboard rows={rows} scale={scale} />
					</section>
				</>
			) : (
				<section id="model-results" className="scroll-mt-36">
					<Callout tone="info" title={t("noResultsTitle")}>{t("noResultsDescription")}</Callout>
				</section>
			)}
		</div>
	);
}
