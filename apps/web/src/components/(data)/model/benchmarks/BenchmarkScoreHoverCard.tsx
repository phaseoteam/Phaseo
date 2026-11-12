import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/Logo";
import {
	HoverCardContent,
	HoverCardHeader,
	HoverCardRows,
	HoverCardStat,
	type HoverCardRow,
} from "@/components/ui/hover-card";
import { isArtificialAnalysisCostBenchmark } from "@/lib/benchmarks/artificialAnalysis";
import { MONEY_LOCALE } from "@/lib/displayPreferences";

/**
 * The gap between another model's score and this model's, signed: "+4.2" or
 * "−$1.20" for a cost benchmark. Null when either score is missing.
 */
export function formatBenchmarkScoreDelta(
	benchmarkId: string,
	score: number | null | undefined,
	baseline: number | null | undefined,
	locale: string,
): string | null {
	if (score == null || baseline == null || !Number.isFinite(score) || !Number.isFinite(baseline)) return null;
	const cost = isArtificialAnalysisCostBenchmark(benchmarkId);
	return new Intl.NumberFormat(cost ? MONEY_LOCALE : locale, {
		...(cost ? { style: "currency", currency: "USD", maximumFractionDigits: 2 } : { maximumFractionDigits: 1 }),
		signDisplay: "exceptZero",
	}).format(score - baseline);
}

/**
 * The card on a benchmark or value bar: the model as the header, its score as
 * the headline, then configuration, rank and how it compares as rows. Used by
 * the model page's benchmark chart and the rankings page's value chart.
 */
export function BenchmarkScoreHoverCardContent({
	modelId,
	modelName,
	logoId,
	meta,
	score,
	scoreSuffix,
	rows,
}: {
	modelId: string;
	modelName: string;
	logoId: string;
	meta: ReadonlyArray<ReactNode>;
	score: string;
	/** A unit after the headline, such as "per point". */
	scoreSuffix?: string | null;
	rows: ReadonlyArray<HoverCardRow | null | false | undefined>;
}) {
	return (
		<HoverCardContent align="center" className="w-72 space-y-2.5">
			<HoverCardHeader
				icon={
					<span className="relative block size-4 shrink-0 overflow-hidden rounded-sm">
						<Logo id={logoId} alt="" fill className="object-contain" />
					</span>
				}
				title={
					<Link
						href={`/models/${modelId}`}
						className="underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						{modelName}
					</Link>
				}
				meta={meta}
			/>
			<HoverCardStat>
				{score}
				{scoreSuffix ? <span className="ml-1 text-xs font-normal text-muted-foreground">{scoreSuffix}</span> : null}
			</HoverCardStat>
			<HoverCardRows rows={rows} />
		</HoverCardContent>
	);
}
