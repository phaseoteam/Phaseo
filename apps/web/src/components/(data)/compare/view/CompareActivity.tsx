import { useState, type KeyboardEvent, type ReactNode } from "react";
import { useTranslations } from "@/i18n/react";
import { cn } from "@/lib/utils";
import { CompareGrid, CompareRow, CompareSection, GRID_CLASS, useCompareGrid, type CompareCell } from "./CompareGrid";
import { visibleOnPhone } from "./compareViewMath";
import type { CompareActivityDay, CompareViewModel, CompareViewUsageByModel } from "./types";
import { useCompareFormat } from "./useCompareFormat";

/** Stacked bottom to top in this order. */
const SERIES = [
	{ key: "input", label: "activityInput", swatch: "bg-sky-500" },
	{ key: "output", label: "activityOutput", swatch: "bg-emerald-500" },
	{ key: "reasoning", label: "activityReasoning", swatch: "bg-amber-500" },
] as const;

function dayTotal(day: CompareActivityDay): number {
	return day.input + day.output + day.reasoning;
}

function Swatch({ className }: { className: string }) {
	return <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-sm", className)} />;
}

/** Image, audio and video models can have requests without token meters; their bars count requests. */
const REQUEST_SERIES = [{ key: "requests", swatch: "bg-muted-foreground/60" }] as const;

/**
 * One bar per day on the model's own scale. Hovering a day, or moving through
 * the days with the arrow keys, shows that day's tokens by type and its requests.
 */
function ActivityChart({ days, label }: { days: CompareActivityDay[]; label: string }) {
	const t = useTranslations("Catalogue.compareView");
	const format = useCompareFormat();
	const [active, setActive] = useState<number | null>(null);
	const byRequests = days.every((entry) => dayTotal(entry) === 0);
	const bars = byRequests ? REQUEST_SERIES : SERIES;
	const max = Math.max(...days.map((entry) => (byRequests ? entry.requests : dayTotal(entry))), 1);
	const day = active == null ? null : days[active];
	// The bars sit inside role="img", whose content screen readers skip, so the selected day is announced outside it.
	const spoken = day
		? [format.date(day.date), ...SERIES.map((series) => `${t(series.label)} ${format.tokens(day[series.key])}`), `${t("activityRequests")} ${format.tokens(day.requests)}`].join(", ")
		: "";
	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		const step = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
		if (!step) return;
		event.preventDefault();
		setActive((current) => Math.min(days.length - 1, Math.max(0, (current ?? days.length - 1) + step)));
	};
	// Near either edge the tooltip anchors to that edge, so it never leaves the column.
	const anchor = active == null ? "" : active < days.length / 4 ? "left-0" : active > (days.length * 3) / 4 ? "right-0" : "-translate-x-1/2";
	return (
		<div className="space-y-1">
			<div className="flex items-start gap-1.5">
				<span className="w-9 shrink-0 text-right text-[10px] leading-none text-muted-foreground tabular-nums">{byRequests ? format.tokens(max) : format.compactTokens(max)}</span>
				<div
					role="img"
					aria-label={label}
					tabIndex={0}
					onKeyDown={onKeyDown}
					onFocus={() => setActive((current) => current ?? days.length - 1)}
					onBlur={() => setActive(null)}
					onMouseLeave={() => setActive(null)}
					className="relative flex h-[72px] w-full min-w-0 items-stretch gap-px rounded-sm border-b border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				>
					{days.map((entry, index) => (
						<div
							key={entry.date}
							onMouseEnter={() => setActive(index)}
							className={cn("flex h-full min-w-0 flex-1 flex-col-reverse rounded-t-[2px]", index === active && "bg-muted/60")}
						>
							{bars.map((bar) => {
								const value = entry[bar.key];
								return value > 0 ? <span key={bar.key} className={cn("block w-full", bar.swatch)} style={{ height: `${(value / max) * 100}%` }} /> : null;
							})}
						</div>
					))}
					{day ? (
						<div
							aria-hidden
							className={cn("pointer-events-none absolute bottom-full z-10 mb-2 w-max min-w-40 rounded-md border border-border bg-popover p-2.5 text-xs text-popover-foreground shadow-md", anchor)}
							style={anchor === "-translate-x-1/2" ? { left: `${((active! + 0.5) / days.length) * 100}%` } : undefined}
						>
							<p className="mb-1.5 font-medium">{format.date(day.date)}</p>
							<dl className="space-y-1 tabular-nums">
								{SERIES.map((series) => (
									<div key={series.key} className="flex items-center justify-between gap-4">
										<dt className="flex items-center gap-1.5 text-muted-foreground"><Swatch className={series.swatch} />{t(series.label)}</dt>
										<dd>{format.tokens(day[series.key])}</dd>
									</div>
								))}
								<div className="flex items-center justify-between gap-4 border-t border-border pt-1">
									<dt className="pl-4 text-muted-foreground">{t("activityRequests")}</dt>
									<dd>{format.tokens(day.requests)}</dd>
								</div>
							</dl>
						</div>
					) : null}
				</div>
			</div>
			<span role="status" className="sr-only">{spoken}</span>
			<div className="flex justify-between pl-[2.625rem] text-[10px] text-muted-foreground">
				<span>{format.shortDate(days[0]!.date)}</span>
				<span>{format.shortDate(days.at(-1)!.date)}</span>
			</div>
		</div>
	);
}

/** A grid row whose cells hold block content (the charts) rather than one value. */
function BlockRow({ label, cells }: { label: ReactNode; cells: ReactNode[] }) {
	const { phonePage } = useCompareGrid();
	return (
		<div role="row" className={cn(GRID_CLASS, "border-b border-border/60 py-3 text-sm")}>
			<div role="rowheader" className="col-span-2 pb-1 text-xs text-muted-foreground sm:col-span-1 sm:px-3 sm:pb-0 sm:text-sm">{label}</div>
			{cells.map((cell, index) => (
				<div key={index} role="cell" className={cn("min-w-0 sm:px-3", !visibleOnPhone(index, phonePage) && "hidden sm:block")}>{cell}</div>
			))}
		</div>
	);
}

/** Each model's daily tokens through Phaseo, in the table's columns: one label per row, values under each model. */
export function CompareActivity({ models, usage }: { models: CompareViewModel[]; usage: CompareViewUsageByModel }) {
	const t = useTranslations("Catalogue.compareView");
	const format = useCompareFormat();
	const activity = models.map((model) => usage[model.id]?.activity30d ?? []);
	const totals = activity.map((days) => days.reduce((sum, day) => sum + dayTotal(day), 0));
	// Image, audio and video models can have requests without token meters.
	const requests = activity.map((days) => days.reduce((sum, day) => sum + day.requests, 0));
	// An older web API sends no daily series; leave the section out rather than claim there was no traffic.
	if (activity.every((days) => days.length === 0)) return null;
	const quiet = (index: number) => totals[index] === 0 && requests[index] === 0;
	const none: CompareCell = { content: "–", text: "", muted: true };
	const seriesCells = (key: (typeof SERIES)[number]["key"]) => activity.map((days, index): CompareCell => {
		if (quiet(index) || totals[index] === 0) return none;
		const value = days.reduce((sum, day) => sum + day[key], 0);
		return { content: format.compactTokens(value), text: String(value) };
	});
	return (
		<CompareSection id="activity" title={t("activity")} description={t("activitySub")}>
			{models.every((_, index) => quiet(index)) ? (
				<p className="text-sm text-muted-foreground sm:px-3">{t("activityNoneAll")}</p>
			) : (
				<CompareGrid label={t("activity")}>
					<CompareRow
						alwaysShow
						label={t("activityTokens30d")}
						cells={models.map((_, index): CompareCell => {
							if (quiet(index)) return { content: t("activityNone"), text: "", muted: true };
							if (totals[index] === 0) return { content: t("activityNoTokens"), text: "", muted: true };
							return { content: <span className="text-lg font-semibold">{format.compactTokens(totals[index]!)}</span>, text: String(totals[index]) };
						})}
					/>
					<BlockRow
						label={t("activityPerDay")}
						cells={models.map((model, index) => (totals[index]! > 0 || requests[index]! > 0 ? <ActivityChart key={model.id} days={activity[index]!} label={t("activityChart", { name: model.name })} /> : null))}
					/>
					{SERIES.map((series) => (
						<CompareRow
							key={series.key}
							alwaysShow
							label={<span className="inline-flex items-center gap-2"><Swatch className={series.swatch} />{t(series.label)}</span>}
							cells={seriesCells(series.key)}
						/>
					))}
					<CompareRow
						alwaysShow
						label={t("activityRequests")}
						cells={requests.map((count, index): CompareCell => (quiet(index) ? none : { content: format.tokens(count), text: String(count) }))}
					/>
				</CompareGrid>
			)}
		</CompareSection>
	);
}
