import Link from "next/link";
import { ArrowUpRight, Repeat2 } from "lucide-react";
import { HorizontalRankingChart } from "@/components/(rankings)/HorizontalRankingChart";
import { InlineInfoTooltip } from "@/components/(rankings)/InlineInfoTooltip";
import { RankingsEmptyState } from "@/components/(rankings)/RankingsEmptyState";
import { Logo } from "@/components/Logo";
import { getModelDetailsHref } from "@/lib/models/modelHref";
import { fetchFrontendModelRetentionRankings } from "@/lib/fetchers/frontend/fetchRankingSections";
import { RankingUnavailable } from "@/components/(rankings)/RankingUnavailable";

function numeric(value: number | string) {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function percent(value: number | string) {
	return `${numeric(value).toFixed(1)}%`;
}

export async function ModelRetentionSection() {
	const result = await fetchFrontendModelRetentionRankings(20).catch(() => null);
	if (!result) return <RankingUnavailable id="retention" title="Return Rate" />;
	const rows = result.data;
	if (!rows.length) {
		return (
			<section id="retention" className="scroll-mt-32 space-y-6 border-t border-border pt-12">
				<SectionHeader />
				<RankingsEmptyState title="Not enough return data yet" description="Return rankings appear after models have enough activity across consecutive completed weeks." />
			</section>
		);
	}

	const totalWorkspaceWeeks = rows.reduce((sum, row) => sum + numeric(row.workspace_weeks), 0);
	const totalReturningWeeks = rows.reduce((sum, row) => sum + numeric(row.returning_workspace_weeks), 0);
	const weightedReturnRate = totalWorkspaceWeeks ? (totalReturningWeeks / totalWorkspaceWeeks) * 100 : 0;
	const maxWeeks = Math.max(...rows.map((row) => numeric(row.weeks_observed)));

	return (
		<section id="retention" className="scroll-mt-32 space-y-8 border-t border-border pt-12">
			<SectionHeader />
			<div className="grid overflow-hidden rounded-xl border border-border/80 bg-card sm:grid-cols-3">
				<SummaryMetric label="Leading model" value={percent(rows[0].retention_rate)} detail={rows[0].model_name} />
				<SummaryMetric label="Observed return rate" value={`${weightedReturnRate.toFixed(1)}%`} detail={`${totalWorkspaceWeeks.toLocaleString()} eligible workspace-weeks`} />
				<SummaryMetric label="Observation window" value={`${maxWeeks} weeks`} detail="Completed UTC week transitions" last />
			</div>
			<div className="space-y-3">
				<div className="flex items-baseline justify-between gap-4">
					<div>
						<h3 className="text-lg font-semibold">Models users return to</h3>
						<p className="text-xs text-muted-foreground">Higher is better · {result.methodology.minimumWorkspaceWeeks}+ eligible workspace-weeks</p>
					</div>
					<span className="hidden text-xs text-muted-foreground sm:inline">Last {result.methodology.cohortWeeks} completed transitions</span>
				</div>
				<HorizontalRankingChart entries={rows.slice(0, 10).map((row) => ({
					key: row.model_id, label: row.model_name, value: numeric(row.retention_rate),
					valueLabel: percent(row.retention_rate), logoId: row.organisation_id ?? row.model_id,
				}))} />
			</div>
			<div className="grid gap-x-16 md:grid-cols-2">
				{rows.map((row, index) => {
					const modelHref = getModelDetailsHref(row.organisation_id, row.model_id);
					return (
						<div key={row.model_id} className="grid min-h-16 grid-cols-[1.5rem_1.75rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-border/70 py-2.5">
							<span className="text-xs tabular-nums text-muted-foreground">{index + 1}.</span>
							<span className="relative size-6"><Logo id={row.organisation_id ?? row.model_id} alt="" fill className="object-contain" /></span>
							<div className="min-w-0">
								{modelHref ? <Link href={modelHref} className="block truncate text-sm font-medium underline decoration-transparent underline-offset-2 transition-colors hover:decoration-current">{row.model_name}</Link> : <span className="block truncate text-sm font-medium">{row.model_name}</span>}
								<p className="truncate text-xs text-muted-foreground">{numeric(row.workspace_weeks).toLocaleString()} workspace-weeks · {numeric(row.weeks_observed)} cohorts</p>
							</div>
							<div className="pl-3 text-right">
								<div className="text-sm font-semibold tabular-nums">{percent(row.retention_rate)}</div>
								<div className="text-[11px] tabular-nums text-muted-foreground">{percent(row.confidence_low)}–{percent(row.confidence_high)}</div>
							</div>
						</div>
					);
				})}
			</div>
		</section>
	);
}

function SectionHeader() {
	return (
		<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
			<div className="space-y-0.5">
				<div className="flex items-center gap-2">
					<span className="flex size-7 items-center justify-center rounded-md border border-border/80 bg-muted/50"><Repeat2 className="size-3.5" /></span>
					<h2 className="text-2xl font-semibold leading-8">Weekly Return Rate</h2>
				</div>
				<p className="max-w-3xl text-sm text-muted-foreground">
					The share of Phaseo workspaces that use the same model again in the following week.{" "}
					<InlineInfoTooltip label="How return rate is calculated" description="Each active model-workspace week is eligible once its following UTC week is complete. A return is counted when that privacy-safe workspace uses the same canonical model in the next week. Rates are pooled across up to 10 transitions; the smaller range below each score is an approximate 95% confidence interval." />
				</p>
			</div>
			<Link href="https://x.com/thdxr/status/2092595257170944266" target="_blank" rel="noreferrer" className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
				Inspiration <ArrowUpRight className="size-3.5" />
			</Link>
		</div>
	);
}

function SummaryMetric({ label, value, detail, last = false }: { label: string; value: string; detail: string; last?: boolean }) {
	return (
		<div className={`px-4 py-4 sm:px-5 ${last ? "" : "border-b border-border/70 sm:border-b-0 sm:border-r"}`}>
			<p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
			<p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
			<p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
		</div>
	);
}
