import { Fragment, useMemo, useState } from "react";
import { useTranslations } from "@/i18n/react";
import { cn } from "@/lib/utils";
import { CompareGrid, CompareGroup, CompareRow, CompareSection, MODEL_COLOURS, type CompareCell } from "./CompareGrid";
import { ComparePeers } from "./ComparePeers";
import { Segmented } from "./ComparePricing";
import {
	bestIndices,
	defaultEffort,
	ECI_BENCHMARK_ID,
	effortLevels,
	formatUsd,
	groupBenchmarks,
	intervalsOverlap,
	pickResult,
} from "./compareViewMath";
import type { CompareEffort, ComparePeerBoard, CompareViewBenchmark, CompareViewModel } from "./types";

const AA_HEADLINE_ID = /^aa-intelligence-index(-v\d+)?$/;

/** Benchmarks by category, in the order they first appear; uncategorised ones last. */
function groupByCategory(benchmarks: CompareViewBenchmark[], otherLabel: string): Array<[string, CompareViewBenchmark[]]> {
	const groups = new Map<string, CompareViewBenchmark[]>();
	for (const benchmark of benchmarks) {
		const key = benchmark.category?.trim() ?? "";
		groups.set(key, [...(groups.get(key) ?? []), benchmark]);
	}
	const named = [...groups.entries()].filter(([key]) => key).map(([key, list]): [string, CompareViewBenchmark[]] => [key.charAt(0).toUpperCase() + key.slice(1), list]);
	const other = groups.get("");
	return other ? [...named, [otherLabel, other]] : named;
}

function scoreText(benchmark: CompareViewBenchmark, score: number): string {
	if (/\(USD\)/.test(benchmark.name)) return formatUsd(score);
	if (benchmark.type === "percentage") return `${Number(score.toFixed(1))}%`;
	return Math.abs(score) >= 100 ? score.toFixed(1) : String(Number(score.toFixed(2)));
}

function SourceBadge({ benchmark }: { benchmark: CompareViewBenchmark }) {
	const t = useTranslations("Catalogue.compareView");
	const label = benchmark.source === "lab" ? t("sourceLab") : t("sourceIndependent");
	return <span className="rounded-sm border border-border px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">{label}</span>;
}

function CapabilityCard({ benchmark, models }: { benchmark: CompareViewBenchmark; models: CompareViewModel[] }) {
	const t = useTranslations("Catalogue.compareView");
	const results = models.map((model) => {
		const picked = pickResult(benchmark, model.id, null);
		return picked.kind === "result" ? picked.result : null;
	});
	const values = results.flatMap((result) => (result ? [result.score, ...(result.ci ?? [])] : []));
	if (!values.length) return null;
	const low = Math.floor(Math.min(...values) / 5) * 5;
	const high = Math.ceil(Math.max(...values) / 5) * 5 || low + 5;
	const span = Math.max(high - low, 1);
	const x = (value: number) => `${((value - low) / span) * 100}%`;
	const intervals = results.flatMap((result) => (result?.ci ? [result.ci] : []));
	const tied = intervals.length >= 2 && intervals.every((a) => intervals.every((b) => intervalsOverlap(a, b)));
	const ticks = Array.from({ length: Math.round(span / 5) + 1 }, (_, index) => low + index * 5);

	return (
		<div className="rounded-md border border-border p-4">
			<h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">{benchmark.name} <SourceBadge benchmark={benchmark} /></h3>
			<p className="mb-3 text-xs text-muted-foreground">{t("eciCardSub")} · {t("eciSource")}</p>
			<div className="space-y-1">
				{models.map((model, index) => {
					const result = results[index];
					return (
						<div key={model.id} className="grid grid-cols-[7rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)_3.5rem]">
							<span className="truncate">{model.name}</span>
							<span className="relative h-5" aria-hidden>
								<span className="absolute inset-x-0 top-1/2 h-px bg-border" />
								{result?.ci ? (
									<span className="absolute top-1/2 h-2 -translate-y-1/2 rounded-sm opacity-30" style={{ left: x(result.ci[0]), width: `calc(${x(result.ci[1])} - ${x(result.ci[0])})`, background: MODEL_COLOURS[index] }} />
								) : null}
								{result ? <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-sm" style={{ left: x(result.score), background: MODEL_COLOURS[index] }} /> : null}
							</span>
							<span className="text-right tabular-nums">
								{result ? result.score.toFixed(1) : <span className="text-xs text-muted-foreground">{t("notReported")}</span>}
								{result?.ci ? <span className="sr-only"> {t("interval", { low: result.ci[0].toFixed(1), high: result.ci[1].toFixed(1) })}</span> : null}
							</span>
						</div>
					);
				})}
				<div className="grid grid-cols-[7rem_minmax(0,1fr)_3.5rem] gap-3 text-[11px] text-muted-foreground sm:grid-cols-[9rem_minmax(0,1fr)_3.5rem]" aria-hidden>
					<span />
					<span className="flex justify-between">{ticks.map((tick) => <span key={tick}>{tick}</span>)}</span>
					<span />
				</div>
			</div>
			{tied ? <p className="mt-3 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">{t("eciTied")}</p> : null}
		</div>
	);
}

function EffortBarCard({ benchmark, models, effort }: { benchmark: CompareViewBenchmark; models: CompareViewModel[]; effort: CompareEffort | null }) {
	const t = useTranslations("Catalogue.compareView");
	const picks = models.map((model) => pickResult(benchmark, model.id, effort));
	const scores = picks.map((picked) => (picked.kind === "result" ? picked.result.score : null));
	const best = bestIndices(scores, benchmark.higherIsBetter ? "higher" : "lower");
	const max = Math.max(1, ...scores.filter((value): value is number => value != null));
	const tested = picks.filter((picked) => picked.kind === "result" && picked.result.effort === effort).length;
	return (
		<div className="rounded-md border border-border p-4">
			<h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">{benchmark.name} <SourceBadge benchmark={benchmark} /></h3>
			<p className="mb-3 text-xs text-muted-foreground">
				{effort ? t("atEffort", { effort: t(`effort.${effort}` as never), tested, total: models.length }) : t("bestVariant")}
			</p>
			<div className="space-y-1.5">
				{models.map((model, index) => {
					const picked = picks[index]!;
					return (
						<div key={model.id} className="grid grid-cols-[7rem_minmax(0,1fr)_4.5rem] items-center gap-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)_4.5rem]">
							<span className="truncate">{model.name}</span>
							<span className={cn("h-2.5 overflow-hidden rounded-sm", picked.kind === "result" ? "bg-muted" : "bg-[repeating-linear-gradient(90deg,var(--border)_0_4px,transparent_4px_8px)]")} aria-hidden>
								{picked.kind === "result" ? <span className="block h-full rounded-sm" style={{ width: `${(picked.result.score / max) * 100}%`, background: MODEL_COLOURS[index] }} /> : null}
							</span>
							<span className={cn("text-right tabular-nums", best.has(index) && "font-semibold text-emerald-600 dark:text-emerald-400")}>
								{picked.kind === "result" && effort && picked.result.effort !== effort && picked.result.variant ? <span className="block text-[11px] font-normal text-muted-foreground">{picked.result.variant}</span> : null}
								{picked.kind === "result" ? scoreText(benchmark, picked.result.score)
									: <span className="text-xs font-normal text-muted-foreground">{picked.kind === "notAtEffort" ? t("notTested") : t("notReported")}</span>}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

export function CompareBenchmarks({ models, benchmarks, peers }: { models: CompareViewModel[]; benchmarks: CompareViewBenchmark[]; peers: ComparePeerBoard[] }) {
	const t = useTranslations("Catalogue.compareView");
	const ids = useMemo(() => models.map((model) => model.id), [models]);
	const levels = useMemo(() => effortLevels(benchmarks, ids), [benchmarks, ids]);
	const [chosen, setChosen] = useState<CompareEffort | null>(null);
	const effort = chosen && levels.some((level) => level.effort === chosen) ? chosen : defaultEffort(levels);
	const [showSingle, setShowSingle] = useState(false);
	const { shared, single } = useMemo(() => groupBenchmarks(benchmarks, ids), [benchmarks, ids]);
	const eci = shared.find((benchmark) => benchmark.id === ECI_BENCHMARK_ID);
	const headline = shared.find((benchmark) => AA_HEADLINE_ID.test(benchmark.id));
	const rows = shared.filter((benchmark) => benchmark !== eci && benchmark !== headline);
	const categories = groupByCategory(rows, t("otherCategory"));
	if (!shared.length && !single.length) return null;

	const cells = (benchmark: CompareViewBenchmark): CompareCell[] => {
		const picks = models.map((model) => pickResult(benchmark, model.id, effort));
		const scores = picks.map((picked) => (picked.kind === "result" ? picked.result.score : null));
		const best = bestIndices(scores, benchmark.higherIsBetter ? "higher" : "lower");
		return picks.map((picked, index): CompareCell => {
			if (picked.kind !== "result") return { content: picked.kind === "notAtEffort" ? t("notTested") : t("notReported"), text: "", muted: true };
			return {
				content: scoreText(benchmark, picked.result.score),
				text: String(picked.result.score),
				best: best.has(index),
				sub: picked.result.effort ? undefined : picked.result.variant ?? undefined,
			};
		});
	};
	const label = (benchmark: CompareViewBenchmark) => (benchmark.link ? (
		<a href={benchmark.link} target="_blank" rel="noopener noreferrer" className="hover:underline">{benchmark.name}</a>
	) : benchmark.name);
	const labelSub = (benchmark: CompareViewBenchmark) => [
		benchmark.source === "lab" ? t("labReported") : benchmark.source === "artificial-analysis" && effort ? t("byEffort") : null,
		benchmark.higherIsBetter ? null : t("lowerIsBetter"),
	].filter(Boolean).join(" · ") || undefined;

	return (
		<CompareSection
			id="benchmarks"
			title={t("benchmarks")}
			description={models.length > 1 ? t("benchmarksSub") : t("benchmarksSubSingle")}
			actions={levels.length > 1 && effort ? (
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-xs text-muted-foreground">{t("compareAtEffort")}</span>
					<Segmented
						label={t("compareAtEffort")}
						value={effort}
						onChange={setChosen}
						options={levels.map((level) => ({ value: level.effort, label: t(`effort.${level.effort}` as never), hint: `${level.models}/${models.length}` }))}
					/>
				</div>
			) : null}
		>
			{eci || headline ? (
				<div className="grid gap-4 lg:grid-cols-2">
					{eci ? <CapabilityCard benchmark={eci} models={models} /> : null}
					{headline ? <EffortBarCard benchmark={headline} models={models} effort={effort} /> : null}
				</div>
			) : null}
			<ComparePeers boards={peers} models={models} />
			{rows.length ? (
				<CompareGrid label={t("sharedBenchmarks")}>
					{categories.map(([category, list]) => (
						<Fragment key={category}>
							<CompareGroup title={category} />
							{list.map((benchmark) => (
								<CompareRow key={benchmark.id} label={label(benchmark)} labelSub={labelSub(benchmark)} cells={cells(benchmark)} />
							))}
						</Fragment>
					))}
				</CompareGrid>
			) : null}
			{single.length ? (
				<div className="space-y-1">
					<button type="button" onClick={() => setShowSingle((value) => !value)} aria-expanded={showSingle} className="text-sm text-muted-foreground hover:text-foreground">
						{showSingle ? "▾" : "▸"} {t("singleBenchmarks", { count: single.length })}
					</button>
					{showSingle ? (
						<CompareGrid label={t("singleBenchmarksLabel")}>
							{single.map((benchmark) => (
								<CompareRow
									key={benchmark.id}
									alwaysShow
									label={label(benchmark)}
									labelSub={labelSub(benchmark)}
									cells={cells(benchmark)}
								/>
							))}
						</CompareGrid>
					) : null}
				</div>
			) : null}
			<p className="text-xs text-muted-foreground">{t("benchmarkSources")}</p>
		</CompareSection>
	);
}
