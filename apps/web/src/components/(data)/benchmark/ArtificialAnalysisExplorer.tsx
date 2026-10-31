"use client";

import { type ReactNode, useMemo, useState } from "react";
import { parseAsArrayOf, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useLocale, useTranslations } from "@/i18n/react";
import { Check, ChevronsUpDown, ListChecks, Search } from "lucide-react";
import { CartesianGrid, ComposedChart, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/Logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { localizedBenchmarkConfiguration } from "@/i18n/benchmark-display";
import { artificialAnalysisChartColour, formatArtificialAnalysisScore } from "@/lib/benchmarks/artificialAnalysis";
import type { ExplorerMetric, ExplorerPoint } from "@/lib/benchmarks/artificialAnalysisExplorer";
import { BenchmarkDisclosure } from "./BenchmarkDisclosure";
import { MONEY_LOCALE } from "@/lib/displayPreferences";

const views = ["cost-intelligence", "intelligence", "coding", "agentic", "cost"] as const;
const scales = ["log", "linear"] as const;
const metricKeys = ["intelligence", "coding", "agentic", "cost"] as const;
const DEFAULT_MODELS = 10;
const ALL_CONFIGURATIONS = "all";
type View = typeof views[number];

const axisTick = { fontSize: 11, fill: "var(--muted-foreground)" };
const axisLabel = { fontSize: 12, fill: "var(--muted-foreground)" };

/** 1–2–5 ticks keep log-scale cost axes readable instead of recharts' arbitrary data-derived values. */
function logTicks(values: number[]) {
	const positive = values.filter((value) => value > 0);
	if (!positive.length) return undefined;
	const min = Math.min(...positive);
	const max = Math.max(...positive);
	const steps: number[] = [];
	for (let exponent = Math.floor(Math.log10(min)); exponent <= Math.ceil(Math.log10(max)); exponent++) for (const step of [1, 2, 5]) steps.push(Number((step * 10 ** exponent).toPrecision(1)));
	const lower = steps.filter((value) => value <= min).at(-1) ?? steps[0];
	const upper = steps.find((value) => value >= max) ?? steps.at(-1)!;
	const ticks = steps.filter((value) => value >= lower && value <= upper);
	return ticks.length > 1 ? ticks : undefined;
}

export default function ArtificialAnalysisExplorer({ points, initialView = "cost-intelligence", footer }: { points: ExplorerPoint[]; initialView?: View; footer?: ReactNode }) {
	const tx = useTranslations();
	const locale = useLocale();
	const [search, setSearch] = useState("");
	const [pickerOpen, setPickerOpen] = useState(false);
	const [filters, setFilters] = useQueryStates({
		aaView: parseAsStringLiteral(views).withDefault(initialView),
		aaScale: parseAsStringLiteral(scales).withDefault("log"),
		aaModels: parseAsArrayOf(parseAsString),
		aaEffort: parseAsString.withDefault(""),
	}, { shallow: true, scroll: false });
	const metricLabel = (metric: ExplorerMetric) => tx(`Catalogue.rankings.benchmarkMetrics.${metric}`);
	const viewLabel = (view: View) => view === "cost-intelligence" ? `${metricLabel("cost")} × ${metricLabel("intelligence")}` : metricLabel(view);
	const format = (metric: ExplorerMetric, score: number) => formatArtificialAnalysisScore(metric === "cost" ? "aa-intelligence-index-cost-v4" : "aa-intelligence-index-v4", score, locale);
	const compactCost = new Intl.NumberFormat(MONEY_LOCALE, { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", notation: "compact", maximumFractionDigits: 1 });
	const configuration = (point: Pick<ExplorerPoint, "variant" | "configuration_label">) => point.configuration_label?.match(/\(([^)]+)\)$/)?.[1] ?? localizedBenchmarkConfiguration(point.variant, tx);
	const scatter = filters.aaView === "cost-intelligence";
	const metric: ExplorerMetric = scatter ? "intelligence" : filters.aaView as ExplorerMetric;
	const logScale = scatter && filters.aaScale === "log";

	const models = useMemo(() => {
		const map = new Map<string, ExplorerPoint>();
		for (const point of points) {
			const previous = map.get(point.model_id);
			if (!previous || (point.intelligence ?? -Infinity) > (previous.intelligence ?? -Infinity)) map.set(point.model_id, point);
		}
		return [...map.values()].sort((a, b) => (b.intelligence ?? -Infinity) - (a.intelligence ?? -Infinity) || a.model_name.localeCompare(b.model_name));
	}, [points]);
	const defaultModels = models.filter((model) => points.some((point) => point.model_id === model.model_id && point[metric] !== undefined && (!scatter || point.cost !== undefined))).slice(0, DEFAULT_MODELS).map((model) => model.model_id);
	const selected = new Set(filters.aaModels ?? (defaultModels.length ? defaultModels : models.slice(0, DEFAULT_MODELS).map((model) => model.model_id)));
	const variants = [...new Set(points.map((point) => point.variant || "default"))].sort();
	const visible = points.filter((point) => selected.has(point.model_id) && (!filters.aaEffort || (point.variant || "default") === filters.aaEffort));
	const plotted = visible.filter((point) => point[metric] !== undefined && (!scatter || (point.cost !== undefined && (!logScale || point.cost > 0))));
	const rows = [...plotted].sort((a, b) => metric === "cost" ? a.cost! - b.cost! : b[metric]! - a[metric]!);
	const colour = (point: ExplorerPoint) => {
		const brand = artificialAnalysisChartColour(point.organisation_id, point.organisation_colour);
		const channels = [1, 3, 5].map((offset) => Number.parseInt(brand.slice(offset, offset + 2), 16));
		return Math.max(...channels) < 96 && Math.max(...channels) - Math.min(...channels) < 12 ? "var(--foreground)" : brand;
	};
	const effortOrder = ["default", "none", "minimal", "low", "medium", "high", "xhigh", "max"];
	const configurations = [...new Set(plotted.map((point) => point.variant || "default"))].sort((a, b) => {
		const rank = (value: string) => effortOrder.indexOf(value.toLowerCase());
		return (rank(a) < 0 ? effortOrder.length : rank(a)) - (rank(b) < 0 ? effortOrder.length : rank(b)) || a.localeCompare(b);
	});
	const series = models.filter((model) => selected.has(model.model_id)).map((model) => ({ model, points: plotted.filter((point) => point.model_id === model.model_id).map((point) => ({ ...point, configurationIndex: configurations.indexOf(point.variant || "default") })).sort((a, b) => scatter ? (a.cost ?? 0) - (b.cost ?? 0) : a.configurationIndex - b.configurationIndex) })).filter((item) => item.points.length);
	const costTicks = logScale ? logTicks(plotted.map((point) => point.cost!)) : undefined;
	const logExcluded = logScale && visible.some((point) => point.cost === 0 && point.intelligence !== undefined);
	const caption = scatter || metric === "cost" ? tx("Catalogue.benchmarks.metricDescriptions.cost") : tx("Catalogue.compare.higherIsBetter");
	const pickerOptions = models.filter((model) => `${model.model_name} ${model.organisation_name ?? ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
	const toggleModel = (modelId: string) => {
		const next = new Set(selected);
		if (next.has(modelId)) next.delete(modelId);
		else next.add(modelId);
		void setFilters({ aaModels: [...next] });
	};

	const modelPicker = <>
						<div className="relative p-2"><Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label={tx("Catalogue.rankings.searchModels")} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tx("Catalogue.benchmarks.filterModels")} className="h-8 pl-8" /></div>
						<div className="max-h-80 overflow-y-auto overscroll-contain p-1" role="group" aria-label={tx("Common.nav.models")}>
							{!pickerOptions.length ? <p className="py-6 text-center text-sm text-muted-foreground">{tx("Catalogue.rankings.noSearchMatches")}</p> : null}
							{pickerOptions.map((model) => <button key={model.model_id} type="button" role="checkbox" aria-checked={selected.has(model.model_id)} onClick={() => toggleModel(model.model_id)} className="flex min-h-8 w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none">
								<span className="relative size-5 shrink-0 overflow-hidden rounded bg-muted"><Logo id={model.organisation_id ?? model.model_id} alt="" fill className="object-contain p-0.5" /></span>
								<span className="min-w-0 flex-1 truncate">{model.model_name}</span>
								<span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: colour(model) }} />
								<Check aria-hidden="true" className={`size-4 shrink-0 ${selected.has(model.model_id) ? "" : "invisible"}`} />
							</button>)}
						</div>
						<div className="grid gap-1.5 border-t p-2">
							<Button variant="ghost" size="sm" className="h-8 bg-muted/40 text-xs" onClick={() => void setFilters({ aaModels: null })}>{tx("Common.ui.rankings.showTop", { count: DEFAULT_MODELS })}</Button>
							<Button variant="ghost" size="sm" className="h-8 justify-between bg-muted/40 px-2.5 text-xs" onClick={() => void setFilters({ aaModels: models.map((model) => model.model_id) })}>{tx("Common.ui.benchmarkChartCopy.showAllModels")}<ListChecks className="size-3.5" /></Button>
						</div>
	</>;

	return <section id="comparisons" className="scroll-mt-24" aria-labelledby="aa-explorer-title">
		<h2 id="aa-explorer-title" className="sr-only">{tx("Catalogue.benchmarks.tocIndexComparisons")}</h2>
		<div className="flex gap-6 overflow-x-auto border-b" role="group" aria-label={tx("Catalogue.rankings.benchmarkMetric")}>
			{views.map((view) => <button key={view} type="button" aria-pressed={filters.aaView === view} onClick={() => void setFilters({ aaView: view })} className={`shrink-0 border-b-2 py-3 text-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${filters.aaView === view ? "border-foreground font-semibold" : "border-transparent text-muted-foreground"}`}>{viewLabel(view)}</button>)}
		</div>

		<div className="flex flex-wrap items-center justify-between gap-3 py-4">
			<p className="text-sm text-muted-foreground">{caption}</p>
			<div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
				{scatter ? <div role="group" aria-label={tx("Catalogue.compare.logScale")} className="flex gap-1">
					{scales.map((scale) => <Button key={scale} size="sm" variant={filters.aaScale === scale ? "secondary" : "ghost"} aria-pressed={filters.aaScale === scale} onClick={() => void setFilters({ aaScale: scale })}>{tx(`Catalogue.compare.${scale === "log" ? "logScale" : "linearScale"}`)}</Button>)}
				</div> : null}
				{variants.length > 1 ? <Select value={filters.aaEffort || ALL_CONFIGURATIONS} onValueChange={(value: string) => void setFilters({ aaEffort: value === ALL_CONFIGURATIONS ? "" : value })}>
					<SelectTrigger size="sm" aria-label={tx("Common.ui.benchmarkChartCopy.modelConfiguration")} className="min-w-36 flex-1 sm:flex-none">
						<SelectValue>{filters.aaEffort ? localizedBenchmarkConfiguration(filters.aaEffort, tx) : tx("Catalogue.benchmarks.allConfigurations")}</SelectValue>
					</SelectTrigger>
					<SelectContent align="end" alignItemWithTrigger={false}>
						<SelectItem value={ALL_CONFIGURATIONS}>{tx("Catalogue.benchmarks.allConfigurations")}</SelectItem>
						{variants.map((variant) => <SelectItem key={variant} value={variant}>{localizedBenchmarkConfiguration(variant, tx)}</SelectItem>)}
					</SelectContent>
				</Select> : null}
				<Popover open={pickerOpen} onOpenChange={setPickerOpen}>
					<PopoverTrigger asChild className="lg:hidden"><Button variant="outline" size="sm" className="flex-1 justify-between gap-3 sm:w-48 sm:flex-none"><span>{tx("Common.nav.models")}</span><span className="ml-auto tabular-nums text-muted-foreground">{selected.size.toLocaleString(locale)} / {models.length.toLocaleString(locale)}</span><ChevronsUpDown className="size-3.5 text-muted-foreground" /></Button></PopoverTrigger>
					<PopoverContent initialFocus={false} align="end" className="w-[min(22rem,calc(100vw-2rem))] gap-0 p-0">{modelPicker}
					</PopoverContent>
				</Popover>
			</div>
		</div>

		<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
		<div className="min-w-0">
		{!plotted.length ? <div role="status" className="flex min-h-80 items-center justify-center border-y text-sm text-muted-foreground">{logExcluded ? <Button variant="outline" onClick={() => void setFilters({ aaScale: "linear" })}>{tx("Catalogue.compare.linearScale")}</Button> : selected.size ? tx("Common.ui.benchmarkChartCopy.noResultsAvailableForThisMetric") : tx("Common.ui.benchmarkChartCopy.selectModelsToCompare")}</div> : <figure>
			<div className="h-[340px] sm:h-[460px]" role="img" aria-label={viewLabel(filters.aaView)}>
				<ResponsiveContainer width="100%" height="100%">
					<ComposedChart margin={{ top: 12, right: 16, bottom: 28, left: 4 }}>
						<CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
						<XAxis type="number" dataKey={scatter ? "cost" : "configurationIndex"} scale={logScale ? "log" : "auto"} domain={!scatter ? [-0.5, Math.max(0.5, configurations.length - 0.5)] : costTicks ? [costTicks[0], costTicks.at(-1)!] : logScale ? ["auto", "auto"] : [0, "auto"]} ticks={scatter ? costTicks : configurations.map((_, index) => index)} allowDataOverflow={false} tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--border)" }} tickFormatter={(value: number) => scatter ? compactCost.format(value) : localizedBenchmarkConfiguration(configurations[value], tx)} label={{ value: scatter ? tx("Catalogue.rankings.intelligenceValue.evaluationCostUsd") : tx("Common.ui.benchmarkChartCopy.modelConfiguration"), position: "bottom", offset: 10, ...axisLabel }} />
						<YAxis type="number" dataKey={metric} tickFormatter={(value: number) => metric === "cost" ? compactCost.format(value) : String(value)} domain={[(min: number) => Math.max(0, Math.floor((min - 2) / 10) * 10), (max: number) => Math.ceil((max + 2) / 10) * 10]} allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={44} label={{ value: metricLabel(metric), angle: -90, position: "insideLeft", style: { textAnchor: "middle", ...axisLabel } }} />
						<Tooltip shared={false} cursor={{ strokeDasharray: "3 3" }} content={({ active, payload }) => {
							const point = payload?.[0]?.payload as ExplorerPoint | undefined;
							return active && point ? <div className="max-w-72 rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-md">
								<p className="font-semibold">{point.model_name}</p>
								<p className="mb-2 text-muted-foreground">{configuration(point)}</p>
								{metricKeys.map((key) => point[key] === undefined ? null : <p key={key} className="flex justify-between gap-6"><span className="text-muted-foreground">{metricLabel(key)}</span><span className="tabular-nums">{format(key, point[key])}</span></p>)}
							</div> : null;
						}} />
						{series.map(({ model, points: modelPoints }) => <Scatter key={model.model_id} name={model.model_name} data={modelPoints} fill={colour(model)} stroke="var(--background)" strokeWidth={1} line={new Set(modelPoints.map((point) => point.variant)).size === modelPoints.length ? { stroke: colour(model), strokeWidth: 1.5, strokeOpacity: 0.7 } : false} lineType="joint" lineJointType="linear" isAnimationActive={false} />)}
					</ComposedChart>
				</ResponsiveContainer>
			</div>
			<figcaption className="flex flex-wrap gap-x-4 gap-y-2 pt-2 text-xs lg:hidden">
				{series.map(({ model }) => <Link key={model.model_id} href={`/models/${model.model_id}`} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"><span aria-hidden="true" className="size-2 rounded-full" style={{ background: colour(model) }} />{model.model_name}</Link>)}
			</figcaption>
		</figure>}

		</div>
		<aside aria-label={tx("Common.nav.models")} className="hidden overflow-hidden rounded-lg border lg:block"><div className="flex items-center justify-between border-b px-3 py-2 text-sm font-medium"><span>{tx("Common.nav.models")}</span><span className="tabular-nums text-muted-foreground">{selected.size} / {models.length}</span></div>{modelPicker}</aside>
		</div>

		{footer}

		<BenchmarkDisclosure title={tx("Catalogue.rankings.intelligenceValue.evaluatedConfigurations")} count={rows.length.toLocaleString(locale)}>
			<div className="max-h-[28rem] overflow-auto">
				<table className="w-full text-left text-sm">
					<caption className="sr-only">{viewLabel(filters.aaView)}</caption>
					<thead className="sticky top-0 border-b bg-muted/30 text-xs text-muted-foreground backdrop-blur">
						<tr><th scope="col" className="px-3 py-3 font-medium">{tx("Catalogue.rankings.intelligenceValue.modelConfiguration")}</th>{metricKeys.map((key) => <th key={key} scope="col" className="px-3 py-3 text-right font-medium">{metricLabel(key)}</th>)}</tr>
					</thead>
					<tbody className="divide-y">
						{rows.map((point) => <tr key={point.id}>
							<th scope="row" className="min-w-52 px-3 py-3 font-normal"><Link className="font-medium hover:underline" href={`/models/${point.model_id}`}>{point.model_name}</Link><p className="mt-0.5 text-xs text-muted-foreground">{configuration(point)}</p></th>
							{metricKeys.map((key) => <td key={key} className="px-3 py-3 text-right tabular-nums">{point[key] === undefined ? "—" : format(key, point[key])}</td>)}
						</tr>)}
					</tbody>
				</table>
			</div>
		</BenchmarkDisclosure>
	</section>;
}
