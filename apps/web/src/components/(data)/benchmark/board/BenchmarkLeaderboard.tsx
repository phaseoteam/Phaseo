import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ExternalLink, Search } from "lucide-react";
import { useQueryState } from "nuqs";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "@/i18n/react";
import { localizedBenchmarkConfiguration } from "@/i18n/benchmark-display";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
	boardColumns,
	buildLeaderboard,
	formatBenchmarkValue,
	formatDuration,
	formatInterval,
	formatTokenCount,
	formatUsd,
	sortEfforts,
	unitLabel,
	type BenchmarkScale,
	type BoardRow,
} from "@/lib/benchmarks/boardResults";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;
const ALL = "all";

export function SelfReportedBadge({ className }: { className?: string }) {
	const t = useTranslations("Catalogue.benchmarks.board");
	return <span title={t("selfReportedHelp")} className={cn("inline-flex shrink-0 items-center rounded-[4px] border border-amber-500/40 bg-amber-500/10 px-1.5 py-px text-[11px] font-medium text-amber-700 dark:text-amber-300", className)}>{t("selfReported")}</span>;
}

/** Leaderboard for one benchmark: one row per model at its best configuration, the rest expandable. */
export function BenchmarkLeaderboard({ rows, scale }: { rows: BoardRow[]; scale: BenchmarkScale }) {
	const t = useTranslations("Catalogue.benchmarks.board");
	const tx = useTranslations();
	const locale = useLocale();
	const [effortParam, setEffortParam] = useQueryState("effort", { defaultValue: "", shallow: true, scroll: false });
	const [query, setQuery] = useState("");
	const [limit, setLimit] = useState(PAGE_SIZE);
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const efforts = useMemo(() => sortEfforts(rows.flatMap((row) => (row.effort ? [row.effort] : []))), [rows]);
	const effort = efforts.includes(effortParam) ? effortParam : null;
	const entries = useMemo(() => buildLeaderboard(rows, { higherIsBetter: scale.higherIsBetter, effort }), [rows, scale.higherIsBetter, effort]);
	const columns = boardColumns(rows);
	const normalizedQuery = query.trim().toLocaleLowerCase();
	const visible = normalizedQuery
		? entries.filter((entry) => `${entry.best.modelName} ${entry.best.organisationName ?? ""} ${entry.best.modelId}`.toLocaleLowerCase().includes(normalizedQuery))
		: entries;
	const shown = visible.slice(0, limit);
	const label = unitLabel(scale);
	const effortLabel = (value: string | null) => (value ? localizedBenchmarkConfiguration(value, tx as never) : "—");
	const toggle = (modelId: string) => setExpanded((current) => {
		const next = new Set(current);
		if (next.has(modelId)) next.delete(modelId); else next.add(modelId);
		return next;
	});

	const cells = (row: BoardRow) => <>
		<TableCell className="text-right">
			<span className="font-semibold tabular-nums">{row.score == null ? "—" : formatBenchmarkValue(row.score, scale, locale)}</span>
			{columns.interval ? <span className="block text-[11px] tabular-nums text-muted-foreground">{formatInterval(row.ciLow, row.ciHigh, scale, locale) ?? ""}</span> : null}
		</TableCell>
		{columns.effort ? <TableCell className="text-sm text-muted-foreground">{effortLabel(row.effort)}</TableCell> : null}
		{columns.harness ? <TableCell className="max-w-40 truncate text-sm text-muted-foreground" title={row.harness ?? undefined}>{row.harness ?? "—"}</TableCell> : null}
		{columns.config ? <TableCell className="max-w-40 truncate text-sm text-muted-foreground" title={row.config ?? undefined}>{row.config ?? "—"}</TableCell> : null}
		{columns.cost ? <TableCell className="text-right text-sm tabular-nums">{row.costUsd == null ? "—" : formatUsd(row.costUsd)}</TableCell> : null}
		{columns.tokens ? <TableCell className="text-right text-sm tabular-nums">{row.outputTokens == null ? "—" : formatTokenCount(row.outputTokens, locale)}</TableCell> : null}
		{columns.duration ? <TableCell className="text-right text-sm tabular-nums">{row.durationSeconds == null ? "—" : formatDuration(row.durationSeconds, locale)}</TableCell> : null}
		<TableCell className="w-8 px-1">{row.link ? <a href={row.link} target="_blank" rel="noopener noreferrer" aria-label={t("openResult", { model: row.modelName })} className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><ExternalLink className="size-3.5" /></a> : null}</TableCell>
	</>;

	return (
		<div className="space-y-4">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<h2 className="text-xl font-semibold tracking-tight">{t("leaderboard")}</h2>
					<p className="mt-1 text-sm text-muted-foreground">{t("leaderboardHelp")}</p>
				</div>
				<div className="flex w-full gap-2 sm:w-auto">
					<div className="relative flex-1 sm:w-56 sm:flex-none">
						<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input aria-label={t("searchModels")} placeholder={t("searchModels")} value={query} onChange={(event) => { setQuery(event.target.value); setLimit(PAGE_SIZE); }} className="pl-9" />
					</div>
					{efforts.length > 1 ? (
						<Select value={effort ?? ALL} onValueChange={(value: string) => { void setEffortParam(value === ALL ? null : value); setLimit(PAGE_SIZE); }}>
							<SelectTrigger aria-label={t("effortFilter")} className="w-40 shrink-0"><SelectValue>{effort ? effortLabel(effort) : t("allEfforts")}</SelectValue></SelectTrigger>
							<SelectContent align="end" alignItemWithTrigger={false}>
								<SelectItem value={ALL}>{t("allEfforts")}</SelectItem>
								{efforts.map((value) => <SelectItem key={value} value={value}>{effortLabel(value)}</SelectItem>)}
							</SelectContent>
						</Select>
					) : null}
				</div>
			</div>

			{columns.selfReported ? <Callout tone="info">{t("selfReportedExplainer")}</Callout> : null}

			<div className="overflow-x-auto rounded-md border">
				<Table>
					<TableHeader>
						<TableRow className="hover:bg-transparent">
							<TableHead className="w-12 text-right">{t("rank")}</TableHead>
							<TableHead>{t("model")}</TableHead>
							<TableHead className="text-right">{label ? t("scoreWithUnit", { unit: label }) : t("score")}</TableHead>
							{columns.effort ? <TableHead>{t("effort")}</TableHead> : null}
							{columns.harness ? <TableHead>{t("harness")}</TableHead> : null}
							{columns.config ? <TableHead>{t("config")}</TableHead> : null}
							{columns.cost ? <TableHead className="text-right">{t("cost")}</TableHead> : null}
							{columns.tokens ? <TableHead className="text-right">{t("tokens")}</TableHead> : null}
							{columns.duration ? <TableHead className="text-right">{t("duration")}</TableHead> : null}
							<TableHead className="w-8 px-1"><span className="sr-only">{t("source")}</span></TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{shown.map((entry) => {
							const open = expanded.has(entry.best.modelId);
							return (
								<Fragment key={entry.best.modelId}>
									<TableRow>
										<TableCell className="text-right tabular-nums text-muted-foreground">{entry.rank ?? "—"}</TableCell>
										<TableCell className="min-w-56">
											<div className="flex items-center gap-2.5">
												<span className="relative size-5 shrink-0 overflow-hidden rounded-[4px] bg-muted"><Logo id={entry.best.organisationId ?? entry.best.modelId} alt="" fill className="object-contain p-0.5" /></span>
												<div className="min-w-0">
													<div className="flex min-w-0 items-center gap-2">
														<Link href={`/models/${entry.best.modelId}`} className="truncate font-medium hover:underline">{entry.best.modelName}</Link>
														{entry.best.selfReported ? <SelfReportedBadge /> : null}
													</div>
													{entry.others.length ? (
														<button type="button" aria-expanded={open} onClick={() => toggle(entry.best.modelId)} className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
															{open ? t("hideConfigurations") : t("moreConfigurations", { count: entry.others.length })}
															<ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
														</button>
													) : null}
												</div>
											</div>
										</TableCell>
										{cells(entry.best)}
									</TableRow>
									{open ? entry.others.map((other) => (
										<TableRow key={other.id} className="bg-muted/30 hover:bg-muted/40">
											<TableCell />
											<TableCell className="pl-[2.875rem] text-sm text-muted-foreground">
												<span className="flex items-center gap-2">{[other.effort ? effortLabel(other.effort) : null, other.harness, other.config].filter(Boolean).join(", ") || t("defaultConfiguration")}{other.selfReported ? <SelfReportedBadge /> : null}</span>
											</TableCell>
											{cells(other)}
										</TableRow>
									)) : null}
								</Fragment>
							);
						})}
					</TableBody>
				</Table>
				{!visible.length ? <p className="py-10 text-center text-sm text-muted-foreground">{t("noMatches")}</p> : null}
			</div>
			{visible.length > limit ? (
				<div className="text-center">
					<Button variant="outline" onClick={() => setLimit((value) => value + PAGE_SIZE)}>{t("showMore", { count: Math.min(PAGE_SIZE, visible.length - limit) })}</Button>
				</div>
			) : null}
		</div>
	);
}
