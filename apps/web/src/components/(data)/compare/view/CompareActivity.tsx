import { useTranslations } from "@/i18n/react";
import { cn } from "@/lib/utils";
import { CompareSection, GRID_CLASS, gridStyle, useCompareGrid } from "./CompareGrid";
import { visibleOnPhone } from "./compareViewMath";
import type { CompareActivityDay, CompareViewModel, CompareViewUsageByModel } from "./types";
import { useCompareFormat } from "./useCompareFormat";

/** Stacked bottom to top in this order. */
const SERIES = [
	{ key: "input", label: "activityInput", colour: "fill-sky-500", swatch: "bg-sky-500" },
	{ key: "output", label: "activityOutput", colour: "fill-emerald-500", swatch: "bg-emerald-500" },
	{ key: "reasoning", label: "activityReasoning", colour: "fill-amber-500", swatch: "bg-amber-500" },
] as const;

const CHART_HEIGHT = 72;

function dayTotal(day: CompareActivityDay): number {
	return day.input + day.output + day.reasoning;
}

function ActivityChart({ days, label }: { days: CompareActivityDay[]; label: string }) {
	const t = useTranslations("Catalogue.compareView");
	const format = useCompareFormat();
	const max = Math.max(...days.map(dayTotal), 1);
	const width = days.length * 6;
	return (
		<div className="space-y-1">
			<div className="flex items-start gap-1.5">
				<span className="w-9 shrink-0 text-right text-[10px] leading-none text-muted-foreground tabular-nums">{format.compactTokens(max)}</span>
				<svg role="img" aria-label={label} viewBox={`0 0 ${width} ${CHART_HEIGHT}`} preserveAspectRatio="none" className="h-[72px] w-full border-b border-border">
					{days.map((day, index) => {
						let top = CHART_HEIGHT;
						return (
							<g key={day.date}>
								<title>{t("activityDay", { date: format.shortDate(day.date), tokens: format.compactTokens(dayTotal(day)), requests: format.tokens(day.requests), count: day.requests })}</title>
								{/* A full-height hit area, so quiet days still show their tooltip. */}
								<rect x={index * 6} y={0} width={6} height={CHART_HEIGHT} className="fill-transparent" />
								{SERIES.map((series) => {
									const height = (day[series.key] / max) * CHART_HEIGHT;
									if (height <= 0) return null;
									top -= height;
									return <rect key={series.key} x={index * 6 + 0.75} y={top} width={4.5} height={height} className={series.colour} />;
								})}
							</g>
						);
					})}
				</svg>
			</div>
			<div className="flex justify-between pl-[2.625rem] text-[10px] text-muted-foreground">
				<span>{format.shortDate(days[0]!.date)}</span>
				<span>{format.shortDate(days.at(-1)!.date)}</span>
			</div>
		</div>
	);
}

/** Each model's daily tokens through Phaseo, under its own column. */
export function CompareActivity({ models, usage }: { models: CompareViewModel[]; usage: CompareViewUsageByModel }) {
	const t = useTranslations("Catalogue.compareView");
	const format = useCompareFormat();
	const { modelCount, phonePage } = useCompareGrid();
	const activity = models.map((model) => usage[model.id]?.activity30d ?? []);
	const totals = activity.map((days) => days.reduce((sum, day) => sum + dayTotal(day), 0));
	// Image, audio and video models can have requests without token meters.
	const requests = activity.map((days) => days.reduce((sum, day) => sum + day.requests, 0));
	// An older web API sends no daily series; leave the section out rather than claim there was no traffic.
	if (activity.every((days) => days.length === 0)) return null;
	return (
		<CompareSection id="activity" title={t("activity")} description={t("activitySub")}>
			{totals.every((total, index) => total === 0 && requests[index] === 0) ? (
				<p className="text-sm text-muted-foreground sm:px-3">{t("activityNoneAll")}</p>
			) : (
				<div style={gridStyle(modelCount)} className={cn(GRID_CLASS, "gap-y-4")}>
					<ul className="col-span-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground sm:col-span-1 sm:block sm:space-y-1.5 sm:px-3">
						{SERIES.map((series) => (
							<li key={series.key} className="flex items-center gap-2">
								<span aria-hidden className={cn("size-2.5 rounded-sm", series.swatch)} />
								{t(series.label)}
							</li>
						))}
					</ul>
					{models.map((model, index) => {
						const days = activity[index]!;
						const total = totals[index]!;
						return (
							<div key={model.id} className={cn("min-w-0 space-y-3 sm:px-3", !visibleOnPhone(index, phonePage) && "hidden sm:block")}>
								{total === 0 && requests[index]! > 0 ? (
									<p className="text-sm">
										<span className="text-xl font-semibold tabular-nums">{format.tokens(requests[index]!)}</span>
										<span className="ml-1.5 text-xs text-muted-foreground">{t("activityRequestsTotal")}</span>
									</p>
								) : total > 0 && days.length > 0 ? (
									<>
										<p className="text-sm">
											<span className="text-xl font-semibold tabular-nums">{format.compactTokens(total)}</span>
											<span className="ml-1.5 text-xs text-muted-foreground">{t("activityTotal")}</span>
										</p>
										<ActivityChart days={days} label={t("activityChart", { name: model.name })} />
										<dl className="space-y-1 text-xs">
											{SERIES.map((series) => (
												<div key={series.key} className="flex items-center justify-between gap-2">
													<dt className="flex items-center gap-2 text-muted-foreground">
														<span aria-hidden className={cn("size-2 rounded-sm", series.swatch)} />
														{t(series.label)}
													</dt>
													<dd className="font-medium tabular-nums">{format.compactTokens(days.reduce((sum, day) => sum + day[series.key], 0))}</dd>
												</div>
											))}
											<div className="flex items-center justify-between gap-2">
												<dt className="pl-4 text-muted-foreground">{t("activityRequests")}</dt>
												<dd className="font-medium tabular-nums">{format.tokens(requests[index]!)}</dd>
											</div>
										</dl>
									</>
								) : (
									<p className="text-sm text-muted-foreground">{t("activityNone")}</p>
								)}
							</div>
						);
					})}
				</div>
			)}
		</CompareSection>
	);
}
