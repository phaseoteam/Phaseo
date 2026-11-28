import { useMemo, useState } from "react";
import { ArrowUpRight, ChevronDown, Search } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "@/i18n/react";
import { localizedBenchmarkConfiguration } from "@/i18n/benchmark-display";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SelfReportedBadge } from "@/components/(data)/benchmark/board/BenchmarkLeaderboard";
import {
	buildProfile,
	formatBenchmarkValue,
	groupByCategory,
	headlineIndexes,
	profileEfforts,
	rowEffort,
	topPercent,
	type ProfileBenchmark,
	type ProfileRow,
} from "@/lib/benchmarks/boardResults";
import { cn } from "@/lib/utils";

const BEST = "best";
const CATEGORY_PREVIEW = 8;

type Translator = ReturnType<typeof useTranslations>;

function configurationLabel(row: ProfileRow, tx: Translator) {
	const effort = rowEffort(row);
	return [effort ? localizedBenchmarkConfiguration(effort, tx as never) : null, row.harness, row.config].filter(Boolean).join(", ");
}

function RankText({ rank, total }: { rank?: number; total?: number }) {
	const t = useTranslations("Catalogue.benchmarks.profile");
	const locale = useLocale();
	if (!rank || !total) return null;
	const percent = topPercent(rank, total);
	return (
		<span className="tabular-nums">
			{t("rankOf", { rank: new Intl.NumberFormat(locale).format(rank), total: new Intl.NumberFormat(locale).format(total) })}
			{percent != null && percent <= 50 ? <span className="text-muted-foreground"> ({t("topPercent", { percent })})</span> : null}
		</span>
	);
}

/** Headline indexes with the model's rank among all ranked models. Only indexes with a value appear. */
export function ModelBenchmarkIndexes({ benchmarks }: { benchmarks: ProfileBenchmark[] }) {
	const t = useTranslations("Catalogue.benchmarks.profile");
	const locale = useLocale();
	const figures = headlineIndexes(benchmarks);
	if (!figures.length) return null;
	return (
		<section aria-labelledby="benchmark-indexes-heading">
			<h3 id="benchmark-indexes-heading" className="text-sm font-medium text-muted-foreground">{t("indexesTitle")}</h3>
			<div className="mt-3 grid grid-cols-2 overflow-hidden rounded-md border sm:grid-cols-3 lg:grid-cols-4">
				{figures.map(({ key, publisher, benchmark }) => (
					<Link
						key={key}
						href={`/benchmarks/${benchmark.benchmarkId}`}
						className="group -mb-px -mr-px min-w-0 border-b border-r p-4 transition-colors hover:bg-muted/30"
					>
						<span className="flex items-center justify-between gap-2 text-sm font-medium">
							<span className="truncate">{t(`indexes.${key}`)}</span>
							<ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
						</span>
						<span className="block truncate text-xs text-muted-foreground">{publisher}</span>
						<span className="mt-2 block text-2xl font-semibold tracking-tight tabular-nums">{formatBenchmarkValue(benchmark.primary.score!, benchmark.scale, locale)}</span>
						<span className="mt-0.5 block text-xs"><RankText rank={benchmark.rank} total={benchmark.rankedModels} /></span>
					</Link>
				))}
			</div>
		</section>
	);
}

/** Evaluation notes from hand-entered results (harness, shots, qualifications). Clamped; click to read in full. */
function ResultNote({ note }: { note?: string }) {
	const [open, setOpen] = useState(false);
	if (!note) return null;
	return (
		<button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className={cn("mt-1 block w-full text-left text-xs text-muted-foreground hover:text-foreground", !open && "line-clamp-2")}>
			{note}
		</button>
	);
}

function ProfileResultRow({ item }: { item: ProfileBenchmark }) {
	const t = useTranslations("Catalogue.benchmarks.profile");
	const boardT = useTranslations("Catalogue.benchmarks.board");
	const tx = useTranslations();
	const locale = useLocale();
	const [open, setOpen] = useState(false);
	const primaryConfig = configurationLabel(item.primary, tx);
	const source = item.primary.publisher ?? item.primary.sourceName;
	const sourceHref = item.primary.link ?? item.primary.sourceUrl;
	return (
		<li className="border-b py-3">
			<div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,1fr)_7rem_9rem]">
				<div className="min-w-0">
					<div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
						<Link href={`/benchmarks/${item.benchmarkId}`} className="truncate text-sm font-medium hover:underline">{item.name}</Link>
						{item.primary.selfReported ? <SelfReportedBadge /> : null}
					</div>
					<p className="mt-0.5 truncate text-xs text-muted-foreground">
						{primaryConfig}
						{primaryConfig && source ? ", " : ""}
						{source ? (sourceHref ? <a href={sourceHref} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">{source}</a> : source) : null}
					</p>
					<ResultNote note={item.primary.note} />
				</div>
				<div className="text-right">
					<span className="text-sm font-semibold tabular-nums">{item.primary.score == null ? item.primary.scoreText ?? "—" : formatBenchmarkValue(item.primary.score, item.scale, locale)}</span>
				</div>
				<div className="col-span-2 text-xs sm:col-span-1 sm:text-right"><RankText rank={item.rank} total={item.rankedModels} /></div>
			</div>
			{item.selfReported?.score != null ? (
				<p className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
					<SelfReportedBadge />
					<span className="tabular-nums">{formatBenchmarkValue(item.selfReported.score, item.scale, locale)}</span>
					{item.selfReported.link ? <a href={item.selfReported.link} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">{t("claimSource")}</a> : null}
				</p>
			) : null}
			{item.selfReported?.score != null ? <ResultNote note={item.selfReported.note} /> : null}
			{item.others.length ? (
				<>
					<button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
						{open ? boardT("hideConfigurations") : boardT("moreConfigurations", { count: item.others.length })}
						<ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
					</button>
					{open ? (
						<ul className="mt-1.5 space-y-1 border-l pl-3">
							{item.others.map((other) => (
								<li key={other.id} className="flex items-center justify-between gap-4 text-xs">
									<span className="truncate text-muted-foreground">{configurationLabel(other, tx) || boardT("defaultConfiguration")}</span>
									<span className="tabular-nums">{other.score == null ? other.scoreText ?? "—" : formatBenchmarkValue(other.score, item.scale, locale)}</span>
								</li>
							))}
						</ul>
					) : null}
				</>
			) : null}
		</li>
	);
}

function CategoryGroup({ category, items, expandAll }: { category: string; items: ProfileBenchmark[]; expandAll: boolean }) {
	const t = useTranslations("Catalogue.benchmarks.profile");
	const categoryT = useTranslations("Catalogue.benchmarks.categories");
	const [showAll, setShowAll] = useState(false);
	const visible = showAll || expandAll ? items : items.slice(0, CATEGORY_PREVIEW);
	return (
		<section aria-label={categoryT(category as never)}>
			<h4 className="flex items-baseline gap-2 border-b pb-2 text-sm font-semibold">{categoryT(category as never)}<span className="text-xs font-normal text-muted-foreground">{items.length}</span></h4>
			<ul>{visible.map((item) => <ProfileResultRow key={item.benchmarkId} item={item} />)}</ul>
			{!expandAll && items.length > CATEGORY_PREVIEW ? (
				<Button variant="ghost" size="sm" className="mt-1" onClick={() => setShowAll((value) => !value)}>
					{showAll ? t("showFewer") : t("showAllInCategory", { count: items.length })}
					<ChevronDown className={cn("transition-transform", showAll && "rotate-180")} />
				</Button>
			) : null}
		</section>
	);
}

/** The model's indexes, then every benchmark result grouped by category. */
export function ModelBenchmarkProfile({ rows }: { rows: ProfileRow[] }) {
	const t = useTranslations("Catalogue.benchmarks.profile");
	const tx = useTranslations();
	const [effort, setEffort] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const efforts = useMemo(() => profileEfforts(rows), [rows]);
	const all = useMemo(() => buildProfile(rows), [rows]);
	const benchmarks = useMemo(() => (effort ? buildProfile(rows, effort) : all), [rows, effort, all]);
	const normalizedQuery = query.trim().toLocaleLowerCase();
	const filtered = normalizedQuery ? benchmarks.filter((item) => `${item.name} ${item.benchmarkId} ${item.primary.publisher ?? ""}`.toLocaleLowerCase().includes(normalizedQuery)) : benchmarks;
	const groups = groupByCategory(filtered);
	const hasClaims = benchmarks.some((item) => item.selfReported);

	return (
		<div className="space-y-8">
			<ModelBenchmarkIndexes benchmarks={all} />
			<section aria-labelledby="benchmark-results-heading" className="space-y-4">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<h3 id="benchmark-results-heading" className="text-lg font-semibold">{t("allResults")}</h3>
						<p className="text-sm text-muted-foreground">{t("resultsCount", { count: benchmarks.length })}</p>
					</div>
					<div className="flex w-full gap-2 sm:w-auto">
						<div className="relative flex-1 sm:w-56 sm:flex-none">
							<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input aria-label={t("searchBenchmarks")} placeholder={t("searchBenchmarks")} value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" />
						</div>
						{efforts.length > 1 ? (
							<Select value={effort ?? BEST} onValueChange={(value: string) => setEffort(value === BEST ? null : value)}>
								<SelectTrigger aria-label={t("effort")} className="w-52 shrink-0"><SelectValue>{effort ? localizedBenchmarkConfiguration(effort, tx as never) : t("bestEffort")}</SelectValue></SelectTrigger>
								<SelectContent align="end" alignItemWithTrigger={false}>
									<SelectItem value={BEST}>{t("bestEffort")}</SelectItem>
									{efforts.map((value) => <SelectItem key={value} value={value}>{localizedBenchmarkConfiguration(value, tx as never)}</SelectItem>)}
								</SelectContent>
							</Select>
						) : null}
					</div>
				</div>
				{hasClaims ? <Callout tone="info">{t("independentFirst")}</Callout> : null}
				{groups.length ? (
					<div className="grid gap-x-10 gap-y-8 xl:grid-cols-2">
						{groups.map((group) => <CategoryGroup key={group.category} category={group.category} items={group.items} expandAll={Boolean(normalizedQuery)} />)}
					</div>
				) : (
					<p className="py-6 text-sm text-muted-foreground">{effort && !normalizedQuery ? t("noEffortResults") : t("noMatches")}</p>
				)}
			</section>
		</div>
	);
}
