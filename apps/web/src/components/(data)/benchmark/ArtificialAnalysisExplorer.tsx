"use client";

import { useMemo, useState } from "react";
import { parseAsArrayOf, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useLocale, useTranslations } from "next-intl";
import { CartesianGrid, ComposedChart, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/Logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { localizedBenchmarkConfiguration } from "@/i18n/benchmark-display";
import { artificialAnalysisChartColour, formatArtificialAnalysisScore } from "@/lib/benchmarks/artificialAnalysis";
import type { ExplorerMetric, ExplorerPoint } from "@/lib/benchmarks/artificialAnalysisExplorer";

const views = ["cost-intelligence", "intelligence", "coding", "agentic", "cost"] as const;
const scales = ["log", "linear"] as const;
type View = typeof views[number];

export default function ArtificialAnalysisExplorer({ points, initialView = "cost-intelligence" }: { points: ExplorerPoint[]; initialView?: View }) {
	const tx = useTranslations();
	const locale = useLocale();
	const [search, setSearch] = useState("");
	const [filters, setFilters] = useQueryStates({
		aaView: parseAsStringLiteral(views).withDefault(initialView),
		aaScale: parseAsStringLiteral(scales).withDefault("log"),
		aaModels: parseAsArrayOf(parseAsString),
		aaEffort: parseAsString.withDefault(""),
	}, { shallow: true, scroll: false });
	const metricLabel = (metric: ExplorerMetric) => tx(`Catalogue.rankings.benchmarkMetrics.${metric}`);
	const format = (metric: ExplorerMetric, score: number) => formatArtificialAnalysisScore(metric === "cost" ? "aa-intelligence-index-cost-v4" : "aa-intelligence-index-v4", score, locale);
	const configuration = (variant: string | null) => localizedBenchmarkConfiguration(variant, tx);
	const scatter = filters.aaView === "cost-intelligence";
	const metric: ExplorerMetric = scatter ? "intelligence" : filters.aaView as ExplorerMetric;
	const title = scatter ? `${metricLabel("cost")} × ${metricLabel("intelligence")}` : metricLabel(metric);
	const models = useMemo(() => {
		const map = new Map<string, ExplorerPoint>();
		for (const point of points) {
			const previous = map.get(point.model_id);
			if (!previous || (point.intelligence ?? -Infinity) > (previous.intelligence ?? -Infinity)) map.set(point.model_id, point);
		}
		return [...map.values()].sort((a, b) => (b.intelligence ?? -Infinity) - (a.intelligence ?? -Infinity) || a.model_name.localeCompare(b.model_name));
	}, [points]);
	const defaultModels = models.filter((model) => points.some((point) => point.model_id === model.model_id && point.cost !== undefined && point.intelligence !== undefined)).slice(0, 10).map((model) => model.model_id);
	const selected = new Set(filters.aaModels ?? (defaultModels.length ? defaultModels : models.slice(0, 10).map((model) => model.model_id)));
	const variants = [...new Set(points.map((point) => point.variant ?? ""))].sort();
	const visible = points.filter((point) => selected.has(point.model_id) && (!filters.aaEffort || (point.variant ?? "default") === filters.aaEffort));
	const plotted = visible.filter((point) => point[metric] !== undefined && (!scatter || (point.cost !== undefined && (filters.aaScale !== "log" || point.cost > 0))));
	const rows = [...plotted].sort((a, b) => metric === "cost" ? a.cost! - b.cost! : b[metric]! - a[metric]!);
	const colour = (point: ExplorerPoint) => artificialAnalysisChartColour(point.organisation_id, point.organisation_colour);
	const series = models.filter((model) => selected.has(model.model_id)).map((model) => ({ model, points: plotted.filter((point) => point.model_id === model.model_id).sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0)) })).filter((item) => item.points.length);
	const costAxis = tx("Catalogue.rankings.intelligenceValue.evaluationCostUsd");
	const scoreAxis = metricLabel(metric);
	const logExcluded = scatter && filters.aaScale === "log" && visible.some((point) => point.cost === 0 && point.intelligence !== undefined);

	return <section id="comparisons" className="scroll-mt-24 overflow-hidden rounded-xl border" aria-label={tx("Catalogue.benchmarks.tocIndexComparisons")}>
		<div className="flex flex-wrap items-center gap-1 border-b bg-muted/30 p-2" aria-label={tx("Catalogue.benchmarks.tocIndexComparisons")}>
			{views.map((view) => <Button key={view} variant={filters.aaView === view ? "secondary" : "ghost"} size="sm" aria-pressed={filters.aaView === view} onClick={() => void setFilters({ aaView: view })}>{view === "cost-intelligence" ? `${metricLabel("cost")} × ${metricLabel("intelligence")}` : metricLabel(view)}</Button>)}
		</div>
		<div className="grid lg:grid-cols-[minmax(0,1fr)_250px]">
			<div className="min-w-0 p-4 sm:p-6">
				<div className="mb-5 flex flex-wrap items-center justify-between gap-3">
					<div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-xs text-muted-foreground">{scatter || metric === "cost" ? tx("Catalogue.benchmarks.metricDescriptions.cost") : tx("Catalogue.compare.higherIsBetter")}</p></div>
					{scatter ? <div className="flex gap-1">{scales.map((scale) => <Button key={scale} size="sm" variant={filters.aaScale === scale ? "secondary" : "ghost"} aria-pressed={filters.aaScale === scale} onClick={() => void setFilters({ aaScale: scale })}>{tx(`Catalogue.compare.${scale === "log" ? "logScale" : "linearScale"}`)}</Button>)}</div> : null}
				</div>
				{plotted.length ? <div className="h-[360px] sm:h-[min(55vh,560px)] sm:min-h-[360px]" role="img" aria-label={title}>
					<ResponsiveContainer width="100%" height="100%">
						<ComposedChart data={scatter ? undefined : rows.map((row, index) => ({ ...row, position: index + 1 }))} margin={{ top: 16, right: 24, bottom: 36, left: 10 }}>
							<CartesianGrid stroke="var(--border)" strokeDasharray="2 5" vertical={false} />
							<XAxis type="number" dataKey={scatter ? "cost" : "position"} scale={scatter && filters.aaScale === "log" ? "log" : "auto"} domain={scatter && filters.aaScale === "log" ? ["auto", "auto"] : [0, "auto"]} tick={{ fontSize: 11 }} tickFormatter={(value: number) => scatter ? format("cost", value) : String(value)} label={{ value: scatter ? costAxis : tx("Site.homeQuickstart.rank"), position: "bottom", offset: 16, fontSize: 12 }} />
							<YAxis type="number" dataKey={metric} domain={[0, "auto"]} tick={{ fontSize: 11 }} tickFormatter={(value: number) => format(metric, value)} width={metric === "cost" ? 80 : 45} label={{ value: scoreAxis, angle: -90, position: "insideLeft", style: { textAnchor: "middle", fontSize: 12 } }} />
							<Tooltip shared={false} content={({ active, payload }) => {
								const point = payload?.[0]?.payload as ExplorerPoint | undefined;
								return active && point ? <div className="max-w-80 rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-md"><p className="font-semibold">{point.model_name}</p><p className="mb-2 text-xs text-muted-foreground">{point.configuration_label ?? configuration(point.variant)}</p>{(["intelligence", "coding", "agentic", "cost"] as const).map((key) => point[key] === undefined ? null : <p key={key} className="flex justify-between gap-6"><span>{metricLabel(key)}</span><span className="font-mono tabular-nums">{format(key, point[key])}</span></p>)}</div> : null;
							}} />
							{scatter ? series.map(({ model, points: modelPoints }) => <Scatter key={model.model_id} name={model.model_name} data={modelPoints} fill={colour(model)} line={{ stroke: colour(model), strokeWidth: 1.5 }} lineType="joint" lineJointType="linear" isAnimationActive={false} />) : <Scatter data={rows.map((row, index) => ({ ...row, position: index + 1 }))} fill="var(--primary)" isAnimationActive={false} />}
						</ComposedChart>
					</ResponsiveContainer>
				</div> : <p role="status" className="flex min-h-80 items-center justify-center text-sm text-muted-foreground">{tx("Common.ui.benchmarkChartCopy.noResultsAvailableForThisMetric")}</p>}
				<div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">{series.filter((item) => item.points.length).map(({ model }) => <Link key={model.model_id} href={`/models/${model.model_id}`} className="flex items-center gap-2 text-xs hover:underline"><span className="size-2 rounded-full" style={{ background: colour(model) }} /><span>{model.model_name}</span></Link>)}</div>
				{logExcluded ? <p className="mt-4 text-xs text-muted-foreground">{tx("Catalogue.compare.linearScale")}: {tx("Catalogue.rankings.benchmarkMetrics.cost")} = $0</p> : null}
			</div>
			<aside className="border-t bg-muted/15 lg:border-l lg:border-t-0">
				<div className="space-y-3 border-b p-4">
					<div className="flex items-center justify-between"><h3 className="text-sm font-semibold">{tx("Common.nav.models")}</h3><span className="font-mono text-xs text-muted-foreground">{selected.size} / {models.length}</span></div>
					<Input aria-label={tx("Catalogue.rankings.intelligenceValue.searchConfigurations")} placeholder={tx("Catalogue.benchmarks.filterModels")} value={search} onChange={(event) => setSearch(event.target.value)} />
					<select aria-label={tx("Common.ui.benchmarkChartCopy.modelConfiguration")} value={filters.aaEffort} onChange={(event) => void setFilters({ aaEffort: event.target.value })} className="h-8 w-full rounded-md border bg-background px-2 text-xs"><option value="">{tx("Catalogue.benchmarks.allConfigurations")}</option>{variants.map((variant) => <option key={variant} value={variant || "default"}>{configuration(variant)}</option>)}</select>
					<Button variant="ghost" size="sm" className="w-full" onClick={() => void setFilters({ aaModels: selected.size === models.length ? null : models.map((model) => model.model_id) })}>{selected.size === models.length ? tx("Common.ui.rankings.showTop", { count: 10 }) : tx("Common.ui.benchmarkChartCopy.showAllModels")}</Button>
				</div>
				<div className="max-h-64 overflow-y-auto p-2 lg:max-h-[520px]">{models.filter((model) => `${model.model_name} ${model.organisation_name ?? ""}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map((model) => <label key={model.model_id} className="flex cursor-pointer items-center gap-2 rounded-md p-2 text-xs hover:bg-muted"><input type="checkbox" checked={selected.has(model.model_id)} onChange={() => { const next = new Set(selected); if (next.has(model.model_id)) next.delete(model.model_id); else next.add(model.model_id); void setFilters({ aaModels: [...next] }); }} className="accent-current" /><span className="relative size-4 shrink-0"><Logo id={model.organisation_id ?? model.model_id} alt="" fill className="object-contain" /></span><span className="min-w-0 flex-1 truncate">{model.model_name}</span><span className="size-1.5 shrink-0 rounded-full" style={{ background: colour(model) }} /></label>)}</div>
			</aside>
		</div>
		<details className="border-t">
			<summary className="cursor-pointer p-4 text-sm font-medium">{tx("Catalogue.rankings.intelligenceValue.evaluatedConfigurations")} · {plotted.length}</summary>
			<div className="max-h-96 overflow-auto"><table className="w-full text-left text-xs"><caption className="sr-only">{title}</caption><thead className="sticky top-0 bg-background"><tr><th className="p-3">{tx("Catalogue.rankings.intelligenceValue.modelConfiguration")}</th>{(["intelligence", "coding", "agentic", "cost"] as const).map((key) => <th key={key} className="p-3 text-right">{metricLabel(key)}</th>)}</tr></thead><tbody>{rows.map((point) => <tr key={point.id} className="border-t"><th className="p-3 font-normal"><Link className="hover:underline" href={`/models/${point.model_id}`}>{point.model_name}</Link><span className="ml-2 text-muted-foreground">{configuration(point.variant)}</span></th>{(["intelligence", "coding", "agentic", "cost"] as const).map((key) => <td key={key} className="p-3 text-right font-mono tabular-nums">{point[key] === undefined ? "—" : format(key, point[key])}</td>)}</tr>)}</tbody></table></div>
		</details>
	</section>;
}
