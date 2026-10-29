import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Boxes, CalendarDays, ChartLine, CircleCheck, FolderOpen, Hourglass, Info, MessageSquare, Plane, RotateCw } from "lucide-react";
import { inboxLists } from "../../shared/inbox";
import { formatAgoShort, formatRoundedCount } from "@phaseo/app-kit/format";
import { formatSpend } from "../../shared/usageAmounts";
import { localDay, todayPace, usagePeriods, type TodayPace, type UsageCost, type UsagePeriod, type UsageReport } from "../../shared/usageLedger";
import type { Harness } from "../../shared/workspace";
import { errorText, useWorkspace, type UsageView } from "../app/workspace";
import { harnessNames, modelLabel } from "../chat/ModelPicker";
import { HarnessLogo } from "../components/HarnessLogo";
import { ScrollArea } from "../components/ui/scroll-area";
import { Tip } from "../components/ui/tooltip";
import { usePersistedState } from "../lib/persistedState";
import { cn } from "../lib/utils";
import { UsageLimitsPanel } from "../settings/UsageSettings";
import { Group, Row } from "./Inbox";

/** Totals as the website's budgets show them: $1.32, $0.51, with four places below a cent. */
const money = formatSpend;
const tokens = (count: number) => formatRoundedCount(count, "en-US");
const percent = (part: number, whole: number) => whole ? `${Math.round(part / whole * 100)}%` : "0%";

/** Each harness keeps one colour on every chart, as on T3 Code's Usage page; Codex is the foreground, as its logo is. */
const harnessColours: Partial<Record<string, string>> = { phaseo: "#0a84c6", claude: "#d97757", codex: "var(--foreground)", cursor: "#8b8b8b", opencode: "#5b9bbd", grok: "color-mix(in srgb, var(--foreground) 72%, transparent)", antigravity: "#8c7bd1", pi: "#9a8f5e" };
const colour = (harness: string) => harnessColours[harness] ?? "var(--muted-foreground)";
const harnessName = (harness: string) => harnessNames[harness as Harness] ?? harness;
/** A model's name; Claude Code reports versions with dashes (claude-opus-5-5-20261001), read as Claude Opus 5.5. */
const modelName = (model: string) => modelLabel(model.replace(/-\d{8}$/, "").replace(/(\d)-(\d)(?!\d)/g, "$1.$2"));

const views: { id: UsageView; label: string }[] = [{ id: "cost", label: "Cost" }, { id: "tokens", label: "Tokens" }, { id: "limits", label: "Limits" }];

/** The report for a period, read on opening, when chats change (a turn adds usage), every minute and on asking. */
function useUsageReport(period: UsagePeriod) {
	const { overview } = useWorkspace();
	const api = window.phaseoDesktop?.workspace;
	const [report, setReport] = useState<UsageReport>();
	const [error, setError] = useState("");
	const [tick, setTick] = useState(0);
	const [loading, setLoading] = useState(false);
	useEffect(() => { const timer = window.setInterval(() => setTick(value => value + 1), 60_000); return () => window.clearInterval(timer); }, []);
	useEffect(() => api?.onUsageChange(() => setTick(value => value + 1)), [api]);
	useEffect(() => {
		if (!api) return;
		let active = true;
		const changed = report?.period !== period;
		const timer = window.setTimeout(() => {
			setLoading(true);
			void api.usageReport(period).then(value => { if (active) { setReport(value); setError(""); } }, reason => { if (active) setError(errorText(reason)); }).finally(() => { if (active) setLoading(false); });
		}, report && !changed ? 2000 : 0);
		return () => { active = false; window.clearTimeout(timer); };
	}, [api, overview, tick, period]);
	return { report: report?.period === period ? report : undefined, stale: report?.period !== period ? report : undefined, error, loading, refresh: () => setTick(value => value + 1) };
}

/** How today compares with the usual by this time, in words. */
function paceText(today: number, pace: TodayPace) {
	if (!pace.basedOn) return "There are no earlier days to compare with yet.";
	if (!today && !pace.usualByNow) return "Nothing used yet, and usually nothing by now either.";
	const difference = today - pace.usualByNow, share = pace.usualByNow ? Math.round(Math.abs(difference) / pace.usualByNow * 100) : undefined;
	if (Math.abs(difference) < 0.005e9 && (share ?? 0) < 5) return "About your usual for this time of day.";
	return `${money(Math.abs(difference))} ${difference > 0 ? "more" : "less"} than usual by now${share !== undefined ? ` (${difference > 0 ? "+" : "−"}${share}%)` : ""}.`;
}

/** A small set of choices, one picked, like T3 Code's toggles. */
function Choice<Id extends string>({ label, options, value, onChange, disabled }: { label: string; options: { id: Id; label: string }[]; value: Id; onChange: (id: Id) => void; disabled?: boolean }) {
	return <div role="radiogroup" aria-label={label} aria-disabled={disabled || undefined} className={cn("flex shrink-0 items-center gap-0.5 rounded-md bg-muted/70 p-0.5", disabled && "opacity-50")}>
		{options.map(option => <button key={option.id} type="button" role="radio" aria-checked={option.id === value} disabled={disabled} onClick={() => onChange(option.id)}
			className={cn("rounded-[5px] px-2 py-0.5 text-2xs font-medium whitespace-nowrap text-muted-foreground outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring", option.id === value && "bg-background text-foreground shadow-xs")}>{option.label}</button>)}
	</div>;
}

function Figure({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
	return <div className="flex min-w-0 flex-col gap-0.5">
		<span className="truncate text-2xs text-muted-foreground">{label}</span>
		<span className="text-base font-semibold tabular-nums">{value}</span>
		{detail !== undefined && <span className="truncate text-2xs text-muted-foreground tabular-nums">{detail}</span>}
	</div>;
}

/**
 * A smooth path through points already in chart space: a monotone cubic (Fritsch–Carlson), so the curve never rises
 * or dips beyond its points. Two points or fewer are a straight line.
 */
function smoothPath(points: number[][], start = "M") {
	if (points.length < 3) return points.map(([px, py], index) => `${index ? "L" : start}${px},${py}`).join(" ");
	const widths = points.slice(1).map((point, index) => point[0] - points[index][0]);
	const slopes = points.slice(1).map((point, index) => widths[index] ? (point[1] - points[index][1]) / widths[index] : 0);
	const tangents = points.map((_, index) => {
		if (index === 0) return slopes[0];
		if (index === points.length - 1) return slopes.at(-1)!;
		const before = slopes[index - 1], after = slopes[index];
		if (before * after <= 0) return 0;
		const left = widths[index - 1], right = widths[index];
		return 3 * (left + right) / ((2 * right + left) / before + (right + 2 * left) / after);
	});
	return points.slice(1).reduce((path, [px, py], index) => {
		const [ox, oy] = points[index], third = widths[index] / 3;
		return `${path} C${ox + third},${oy + tangents[index] * third} ${px - third},${py - tangents[index + 1] * third} ${px},${py}`;
	}, `${start}${points[0][0]},${points[0][1]}`);
}

/** Two gridlines at round amounts ($0.50, $1; 50K, 100K), the upper one at or above the highest point. */
function roundGrid(highest: number, floor: number) {
	const top = Math.max(highest, floor), magnitude = 10 ** Math.floor(Math.log10(top / 2));
	const step = [1, 2, 2.5, 5, 10].map(factor => factor * magnitude).find(value => value * 2 >= top)!;
	return { top: step * 2 * 1.08, grid: [step, step * 2] };
}

/**
 * Today's cost by the hour against an average recent day, both running totals so the gap is the pace. Labels are HTML
 * over a stretched SVG, so the lines can fill any width without distorting the text.
 */
function PaceChart({ pace, now }: { pace: TodayPace; now: Date }) {
	const [hover, setHover] = useState<number>();
	const at = now.getHours() + now.getMinutes() / 60;
	const today = [[0, 0], ...pace.cumulative.slice(0, -1).map((value, hour) => [hour + 1, value]), [at, pace.cumulative.at(-1) ?? 0]];
	const usual = [[0, 0], ...pace.usual.map((value, hour) => [hour + 1, value])];
	const { top, grid } = roundGrid(Math.max(...today.map(point => point[1]), ...usual.map(point => point[1])), 1e7);
	const x = (hours: number) => hours / 24 * 100, y = (nanos: number) => 100 - nanos / top * 100;
	const path = (points: number[][]) => smoothPath(points.map(([hours, nanos]) => [x(hours), y(nanos)]));
	const valueAt = (points: number[][], hours: number) => { const after = points.findIndex(point => point[0] >= hours); if (after <= 0) return points[Math.max(0, after)]?.[1] ?? 0; const [x0, y0] = points[after - 1], [x1, y1] = points[after]; return y0 + (y1 - y0) * ((hours - x0) / (x1 - x0 || 1)); };
	const last = today.at(-1)!;
	return <figure className="flex flex-col gap-2" aria-label="Cost today against your usual, by hour">
		<figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-muted-foreground">
			<span className="flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-3 rounded-sm bg-foreground" />Today</span>
			{pace.basedOn > 0 && <span className="flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-3 rounded-sm bg-muted-foreground/50" />Usual, averaged over {pace.basedOn === 1 ? "1 day" : `${pace.basedOn} days`}<span className="tabular-nums">· {money(usual.at(-1)![1])} a day</span></span>}
		</figcaption>
		<div className="relative mt-3 h-40" onMouseLeave={() => setHover(undefined)}
			onMouseMove={event => { const box = event.currentTarget.getBoundingClientRect(); setHover(Math.min(24, Math.max(0, (event.clientX - box.left) / box.width * 24))); }}>
			<svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
				{[0, ...grid].map(value => <line key={value} x1={0} x2={100} y1={y(value)} y2={y(value)} vectorEffect="non-scaling-stroke" strokeWidth={1} className="stroke-border/70" />)}
				{pace.basedOn > 0 && <path d={path(usual)} fill="none" vectorEffect="non-scaling-stroke" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-muted-foreground/45" />}
				<path d={path(today)} fill="none" vectorEffect="non-scaling-stroke" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-foreground" />
			</svg>
			{grid.map(value => <span key={value} aria-hidden className="absolute left-0 -translate-y-full pb-0.5 text-2xs text-muted-foreground tabular-nums" style={{ top: `${y(value)}%` }}>{money(value)}</span>)}
			<span aria-hidden className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-foreground ring-2 ring-background" style={{ left: `${x(last[0])}%`, top: `${y(last[1])}%` }} />
			{/* Above the dot: a running total never falls, so today's line is always at or below it there. The background hides the usual line if it passes. */}
			<span className="absolute rounded-sm bg-background px-1 text-2xs font-medium whitespace-nowrap tabular-nums" style={{ left: `${x(last[0])}%`, top: `${y(last[1])}%`, transform: `translate(${last[0] > 12 ? "calc(-100% + 6px)" : "-6px"}, calc(-100% - 7px))` }}>{money(last[1])}</span>
			{hover !== undefined && <>
				<span aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-border" style={{ left: `${x(hover)}%` }} />
				<span role="status" className="pointer-events-none absolute top-0 z-10 flex flex-col gap-0.5 rounded-md border border-border bg-popover px-2 py-1.5 text-2xs whitespace-nowrap text-popover-foreground shadow-md tabular-nums"
					style={{ left: `${x(hover)}%`, transform: `translateX(${hover > 16 ? "calc(-100% - 8px)" : "8px"})` }}>
					<span className="font-medium">By {String(Math.floor(hover)).padStart(2, "0")}:{String(Math.round(hover % 1 * 60) % 60).padStart(2, "0")}</span>
					{hover <= at && <span>Today {money(valueAt(today, hover))}</span>}
					{pace.basedOn > 0 && <span className="text-muted-foreground">Usual {money(valueAt(usual, hover))}</span>}
				</span>
			</>}
		</div>
		<div aria-hidden className="relative h-3 text-2xs text-muted-foreground tabular-nums">{[0, 6, 12, 18, 24].map(hour => <span key={hour} className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full" style={{ left: `${x(hour)}%` }}>{String(hour % 24).padStart(2, "0")}:00</span>)}</div>
	</figure>;
}

/** A bucket's day or hour as a short axis label and a longer hover title. */
function bucketLabels(report: UsageReport) {
	const today = report.period === "today";
	return report.buckets.map(bucket => {
		if (today) return { short: `${bucket.start}:00`, long: `${bucket.start}:00 to ${String(Number(bucket.start) + 1).padStart(2, "0")}:00` };
		const [year, month, day] = bucket.start.split("-").map(Number), date = new Date(year, month - 1, day);
		return { short: date.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), long: date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long" }) };
	});
}

/**
 * Cost or tokens per day (per hour today) with one line per harness, overlaid rather than stacked so each harness reads
 * on its own, as on T3 Code's Usage page. Today's line stops at the current hour.
 */
function HarnessChart({ report, metric, now }: { report: UsageReport; metric: "cost" | "tokens"; now: Date }) {
	const [hover, setHover] = useState<number>();
	const value = (cost: UsageCost | undefined) => !cost ? 0 : metric === "cost" ? cost.costNanos : cost.tokens;
	const format = (amount: number) => metric === "cost" ? money(amount) : tokens(amount);
	const harnesses = report.harnesses.filter(harness => value(harness) > 0).map(harness => harness.harness);
	const count = report.period === "today" ? now.getHours() + 1 : report.buckets.length;
	const buckets = report.buckets.slice(0, count), labels = bucketLabels(report);
	const { top, grid } = roundGrid(Math.max(0, ...buckets.flatMap(bucket => harnesses.map(harness => value(bucket.harnesses[harness])))), metric === "cost" ? 1e7 : 1000);
	const span = Math.max(1, report.buckets.length - 1);
	const x = (index: number) => index / span * 100, y = (amount: number) => 100 - amount / top * 100;
	// The heaviest harness is drawn first, so lighter ones stay visible on top.
	const series = harnesses.map(harness => ({ harness, points: buckets.map((bucket, index) => [x(index), y(value(bucket.harnesses[harness]))]) }));
	const ticks = report.period === "today" ? [0, 6, 12, 18, 23] : [0, Math.floor((report.buckets.length - 1) / 2), report.buckets.length - 1];
	return <figure className="flex flex-col gap-2" aria-label={`${metric === "cost" ? "Cost" : "Tokens"} by ${report.period === "today" ? "hour" : "day"} for each harness`}>
		<figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-muted-foreground">
			{harnesses.map(harness => <span key={harness} className="flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-3 rounded-sm" style={{ background: colour(harness) }} />{harnessName(harness)}</span>)}
			{!harnesses.length && <span>No usage in this period.</span>}
		</figcaption>
		<div className="relative mt-3 ml-11 h-40" onMouseLeave={() => setHover(undefined)}
			onMouseMove={event => { const box = event.currentTarget.getBoundingClientRect(); setHover(Math.min(count - 1, Math.max(0, Math.round((event.clientX - box.left) / box.width * span)))); }}>
			<svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
				{[0, ...grid].map(amount => <line key={amount} x1={0} x2={100} y1={y(amount)} y2={y(amount)} vectorEffect="non-scaling-stroke" strokeWidth={1} className="stroke-border/70" />)}
				{series.map(({ harness, points }) => <g key={harness}>
					{points.length > 1 && <path d={`M${points[0][0]},100 ${smoothPath(points, "L")} L${points.at(-1)![0]},100 Z`} style={{ fill: colour(harness) }} fillOpacity={0.08} />}
					<path d={smoothPath(points)} fill="none" vectorEffect="non-scaling-stroke" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" style={{ stroke: colour(harness) }} />
				</g>)}
			</svg>
			{[0, ...grid].map(amount => <span key={amount} aria-hidden className="absolute -left-11 w-9 -translate-y-1/2 text-right text-2xs text-muted-foreground tabular-nums" style={{ top: `${y(amount)}%` }}>{format(amount)}</span>)}
			{hover !== undefined && buckets[hover] && <>
				<span aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-border" style={{ left: `${x(hover)}%` }} />
				<span role="status" className="pointer-events-none absolute top-0 z-10 flex flex-col gap-0.5 rounded-md border border-border bg-popover px-2 py-1.5 text-2xs whitespace-nowrap text-popover-foreground shadow-md tabular-nums"
					style={{ left: `${x(hover)}%`, transform: `translateX(${x(hover) > 66 ? "calc(-100% - 8px)" : "8px"})` }}>
					<span className="font-medium">{labels[hover].long}</span>
					{harnesses.map(harness => <span key={harness} className="flex items-center gap-1.5"><span aria-hidden className="size-1.5 rounded-[2px]" style={{ background: colour(harness) }} />{harnessName(harness)}<span className="ml-auto pl-3">{format(value(buckets[hover].harnesses[harness]))}</span></span>)}
					{harnesses.length > 1 && <span className="flex border-t border-border/60 pt-0.5 font-medium">Total<span className="ml-auto pl-3">{format(harnesses.reduce((sum, harness) => sum + value(buckets[hover].harnesses[harness]), 0))}</span></span>}
				</span>
			</>}
		</div>
		<div aria-hidden className="relative ml-11 h-3 text-2xs whitespace-nowrap text-muted-foreground tabular-nums">{ticks.map((index, position) => <span key={index} className={cn("absolute", position === 0 ? "" : position === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2")} style={{ left: `${x(index)}%` }}>{labels[index]?.short}</span>)}</div>
	</figure>;
}

/** A bar split into parts with a legend underneath, like T3 Code's share bars. */
function ShareBar({ label, parts, format }: { label: string; parts: { name: string; amount: number; tone: string }[]; format: (amount: number) => string }) {
	const total = parts.reduce((sum, part) => sum + part.amount, 0), shown = parts.filter(part => part.amount > 0);
	return <div className="flex flex-col gap-2">
		<span className="text-xs text-muted-foreground">{label}</span>
		<div aria-hidden className="flex h-2 gap-0.5 overflow-hidden rounded-sm">{shown.map(part => <Tip key={part.name} label={`${part.name}: ${format(part.amount)} (${percent(part.amount, total)})`}><span className="h-full min-w-1 rounded-[2px]" style={{ flexGrow: part.amount, background: part.tone }} /></Tip>)}{!shown.length && <span className="h-full flex-1 rounded-[2px] bg-muted" />}</div>
		<div className="flex flex-wrap gap-x-4 gap-y-1 text-2xs text-muted-foreground tabular-nums">{parts.map(part => <span key={part.name} className="flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-[2px]" style={{ background: part.tone }} />{part.name}<span className="text-foreground">{format(part.amount)}</span></span>)}</div>
	</div>;
}

/** One line of a breakdown: an optional logo, the name, a thin bar against the largest, the amount and its other measure. */
function Share({ name, harness, amount, largest, detail, onOpen, parts }: { name: string; harness?: string; amount: string; largest: number; detail?: string; onOpen?: () => void; parts: { harness: string; amount: number }[] }) {
	const total = parts.reduce((sum, part) => sum + part.amount, 0);
	const content = <>
		{harness && <span aria-hidden className="flex size-4 shrink-0 items-center justify-center [&_.harness-logo]:size-3.5 [&_img]:size-3.5"><HarnessLogo harness={harness as Harness} /></span>}
		<span className="min-w-0 flex-1 truncate text-sm">{name}</span>
		<span aria-hidden className="flex h-1 w-28 shrink-0 overflow-hidden rounded-sm bg-muted"><span className="flex h-full gap-px" style={{ width: `${Math.max(2, total / (largest || 1) * 100)}%` }}>{parts.filter(part => part.amount > 0).map(part => <span key={part.harness} className="h-full" style={{ flexGrow: part.amount, background: colour(part.harness) }} />)}</span></span>
		<span className="w-20 shrink-0 text-right text-xs tabular-nums">{amount}</span>
		<span className="hidden w-24 shrink-0 text-right text-2xs text-muted-foreground tabular-nums sm:block">{detail}</span>
	</>;
	const className = "flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-left";
	return onOpen ? <button type="button" onClick={onOpen} className={cn(className, "outline-none hover:bg-accent/60 focus-visible:ring-1 focus-visible:ring-ring")}>{content}</button> : <div className={className}>{content}</div>;
}

type Breakdown = "models" | "chats" | "projects" | "days";

/**
 * Usage: T3 Code's Usage page joined with Phaseo's Today. Cost and tokens across every harness for today or the last
 * 7, 30 or 90 days, with what Phaseo charged kept apart from what Claude Code and Codex would cost at API prices; today's
 * pace against the usual; what got done; where it went; and the subscription limits.
 */
export function Usage() {
	const { overview, select, openInbox, usageView: view, setUsageView: setView } = useWorkspace();
	const [period, setPeriod] = usePersistedState<UsagePeriod>("phaseo.desktop.usagePeriod", "today");
	const [breakdown, setBreakdown] = useState<Breakdown>("models");
	const { report, stale, error, loading, refresh } = useUsageReport(period);
	const shown = report ?? stale;
	const metric = view === "tokens" ? "tokens" : "cost";
	const now = useMemo(() => new Date(shown?.generatedAt ?? Date.now()), [shown]);
	const pace = useMemo(() => shown?.period === "today" ? todayPace(shown, now) : undefined, [shown, now]);
	const startOfToday = useMemo(() => { const value = new Date(now); value.setHours(0, 0, 0, 0); return value.toISOString(); }, [now]);
	const byId = useMemo(() => new Map(overview.tasks.map(task => [task.id, task])), [overview.tasks]);
	const finished = useMemo(() => overview.tasks.filter(task => !task.archived && task.lastCompletedAt && task.lastCompletedAt >= startOfToday).sort((a, b) => b.lastCompletedAt!.localeCompare(a.lastCompletedAt!)), [overview.tasks, startOfToday]);
	const waiting = useMemo(() => inboxLists(overview.tasks).needsYou.length, [overview.tasks]);
	const from = shown ? new Date(shown.from) : now;
	const range = period === "today" ? now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : `${from.toLocaleDateString("en-GB", { day: "numeric", month: "long" })} to ${now.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`;
	const recordedFrom = shown?.since && localDay(new Date(shown.since)) > localDay(from) ? new Date(shown.since).toLocaleDateString("en-GB", { day: "numeric", month: "long" }) : undefined;
	const amount = (cost: UsageCost) => metric === "cost" ? money(cost.costNanos) : tokens(cost.tokens);
	const other = (cost: UsageCost) => metric === "cost" ? `${tokens(cost.tokens)} tokens` : money(cost.costNanos);
	const sortKey = (cost: UsageCost) => metric === "cost" ? cost.costNanos : cost.tokens;
	const periodLabel = period === "today" ? "today" : `in the last ${usagePeriods.find(value => value.id === period)!.label}`;

	return <div className="flex h-full min-h-0 w-full flex-col bg-background" data-usage-page="">
		<header className="flex h-10 min-h-10 shrink-0 items-center gap-2 border-b border-border/60 px-4">
			<h1 className="text-xs font-medium">Usage</h1>
			<span className="hidden min-w-0 truncate text-2xs text-muted-foreground md:block">{view === "limits" ? "Subscription limits" : range}</span>
			<span className="flex-1" />
			<Choice label="View" options={views} value={view} onChange={setView} />
			<Choice label="Period" options={usagePeriods} value={period} onChange={setPeriod} disabled={view === "limits"} />
			{view !== "limits" && <Tip label="Check again"><button type="button" aria-label="Check again" onClick={refresh} className="grid size-6 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring [&_svg]:size-3.5"><RotateCw className={loading ? "animate-spin" : undefined} /></button></Tip>}
		</header>
		{error && view !== "limits" && <p role="alert" className="shrink-0 border-b border-border/60 px-4 py-1.5 text-xs text-destructive">{error}</p>}
		<ScrollArea className="min-h-0 flex-1">
			{view === "limits" ? <div className="mx-auto w-full max-w-4xl px-7 pt-5 pb-10"><UsageLimitsPanel /></div>
				: !shown ? <p className="px-6 py-24 text-center text-xs text-muted-foreground">{error ? "" : "Adding up your usage…"}</p>
				: <div className={cn("mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pt-5 pb-10 transition-opacity", !report && "opacity-60")}>
					<section aria-label={metric === "cost" ? "Cost" : "Tokens"} className="grid gap-8 px-3 lg:grid-cols-[17rem_minmax(0,1fr)]">
						<div className="flex min-w-0 flex-col gap-4">
							<div className="flex flex-col gap-1">
								<span className="text-xs text-muted-foreground">{metric === "cost" ? "Cost" : "Tokens"} {periodLabel}</span>
								<span className="text-4xl font-semibold tracking-tight tabular-nums">{metric === "cost" ? money(shown.total.costNanos) : tokens(shown.total.tokens)}</span>
								{metric === "cost" ? <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">{money(shown.total.chargedNanos)} charged · {money(shown.total.estimateNanos)} API estimate
									<Tip label={`Phaseo's charges are what you paid. Claude Code and Codex aren't billed per request: their history is read from their transcripts on this computer and priced at Phaseo's catalogue rates, to show what it would cost through the API.${shown.total.unpricedTokens ? ` ${percent(shown.total.unpricedTokens, shown.total.tokens)} of tokens have no price and aren't counted.` : ""}`}><Info aria-label="About the estimate" className="size-3 shrink-0" /></Tip></span>
									: <span className="text-xs text-muted-foreground tabular-nums">{shown.total.chats === 1 ? "1 chat" : `${shown.total.chats} chats`} · {money(shown.total.costNanos)}</span>}
								{metric === "cost" && pace && <p className="mt-1 text-sm">{paceText(pace.cumulative.at(-1) ?? 0, pace)}</p>}
								{metric === "cost" && pace && pace.basedOn > 0 && <p className="text-xs text-muted-foreground tabular-nums">About {money(pace.forecast)} by midnight at your usual pace · usual by now {money(pace.usualByNow)}</p>}
							</div>
							<div className="flex flex-col gap-0.5">
								{shown.harnesses.slice().sort((a, b) => sortKey(b) - sortKey(a)).map(harness => <div key={harness.harness} className="flex items-start gap-2.5 py-1.5">
									<span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-[2px]" style={{ background: colour(harness.harness) }} />
									<span aria-hidden className="mt-0.5 flex size-4 shrink-0 items-center justify-center [&_.harness-logo]:size-3.5 [&_img]:size-3.5"><HarnessLogo harness={harness.harness as Harness} /></span>
									<span className="min-w-0 flex-1">
										<span className="flex items-baseline gap-2"><span className="min-w-0 flex-1 truncate text-sm">{harnessName(harness.harness)}</span><span className="text-sm font-medium tabular-nums">{amount(harness)}</span></span>
										<span className="block truncate text-2xs text-muted-foreground tabular-nums">{metric === "cost" ? `${percent(harness.costNanos, shown.total.costNanos)} of cost · ${harness.harness === "phaseo" ? "charged" : "API estimate"}` : `${percent(harness.tokens, shown.total.tokens)} of tokens · ${money(harness.costNanos)}`} · {harness.chats === 1 ? "1 chat" : `${harness.chats} chats`}</span>
									</span>
								</div>)}
								{!shown.harnesses.length && <p className="py-1.5 text-xs text-muted-foreground">No usage {periodLabel}.</p>}
							</div>
						</div>
						<div className="min-w-0">{metric === "cost" && pace ? <PaceChart pace={pace} now={now} /> : <HarnessChart report={shown} metric={metric} now={now} />}</div>
					</section>

					<section aria-label="Totals" className="flex flex-col gap-4 border-t border-border/60 px-3 pt-4">
						<div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-5">
							<Figure label="Processed tokens" value={tokens(shown.total.tokens)} />
							<Figure label="Uncached input" value={tokens(shown.total.types.input)} />
							<Figure label="Cached input" value={tokens(shown.total.types.cached)} detail={shown.total.types.cacheWrite ? `${tokens(shown.total.types.cacheWrite)} written` : undefined} />
							<Figure label="Output" value={tokens(shown.total.types.output)} detail={shown.total.types.reasoning ? `${tokens(shown.total.types.reasoning)} reasoning` : undefined} />
							<Figure label="Cache savings" value={money(shown.total.cacheSavingsNanos)} />
						</div>
						<ShareBar label="Tokens by type" format={tokens} parts={[
							{ name: "Uncached input", amount: shown.total.types.input, tone: "color-mix(in srgb, var(--foreground) 85%, transparent)" },
							{ name: "Cached input", amount: shown.total.types.cached, tone: "color-mix(in srgb, var(--foreground) 35%, transparent)" },
							{ name: "Cache writes", amount: shown.total.types.cacheWrite, tone: "color-mix(in srgb, var(--foreground) 55%, transparent)" },
							{ name: "Output", amount: shown.total.types.output, tone: "#0a84c6" },
						]} />
					</section>

					<section aria-label="What got done" className="flex flex-col gap-3 border-t border-border/60 px-3 pt-4">
						<h2 className="text-xs font-medium text-muted-foreground">What got done {periodLabel}</h2>
						<div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
							<Figure label="Chats started" value={shown.activity.chatsStarted} />
							<Figure label="Chats finished" value={shown.activity.chatsFinished} />
							<Figure label="Chats settled" value={shown.activity.chatsSettled} />
							<Figure label="Pull requests opened" value={shown.activity.pullRequests?.opened ?? "–"} detail={shown.activity.pullRequests ? "by you" : "GitHub CLI needed"} />
							<Figure label="Pull requests merged" value={shown.activity.pullRequests?.merged ?? "–"} detail={shown.activity.pullRequests ? "by you" : undefined} />
							<Figure label="Autopilot" value={money(shown.autopilot.costNanos)} detail={shown.autopilot.chats ? `in ${shown.autopilot.chats === 1 ? "1 chat" : `${shown.autopilot.chats} chats`}` : "Not used"} />
						</div>
						{waiting > 0 && <Row glyph={{ Icon: Hourglass, tone: "text-warning" }} label={`${waiting} waiting on you, open the Inbox`} onOpen={openInbox}
							title={waiting === 1 ? "1 chat is waiting on you" : `${waiting} chats are waiting on you`} aside="Inbox" />}
					</section>

					<section aria-label="Breakdown" className="flex flex-col gap-2 border-t border-border/60 pt-4">
						<div className="flex items-center gap-2 px-3">
							<h2 className="flex-1 text-xs font-medium text-muted-foreground">Where it went</h2>
							<Choice label="Breakdown" value={breakdown} onChange={setBreakdown} options={[{ id: "models", label: "Models" }, { id: "chats", label: "Chats" }, { id: "projects", label: "Projects" }, { id: "days", label: period === "today" ? "Hours" : "Days" }]} />
						</div>
						<BreakdownRows report={shown} breakdown={breakdown} metric={metric} amount={amount} other={other} sortKey={sortKey}
							chatName={id => byId.get(id)?.title} projectName={id => overview.projects.find(project => project.id === id)?.name} onChat={id => byId.has(id) ? () => select(id) : undefined} />
					</section>

					{period === "today" && <Group Icon={CircleCheck} label="Finished today" count={finished.length || undefined}>
						{finished.length ? finished.slice(0, 12).map(task => <Row key={task.id} glyph={{ Icon: task.autopilot && !task.autopilot.inherited ? Plane : CircleCheck, tone: "text-success" }} label={`${task.title}, finished`} onOpen={() => select(task.id)}
							title={task.title} aside={formatAgoShort(task.lastCompletedAt!, now.getTime())} meta={overview.projects.find(project => project.id === task.projectId)?.name} />)
							: <p className="px-3 py-2 text-xs text-muted-foreground">Nothing has finished yet today.</p>}
					</Group>}

					<p className="flex items-start gap-2 px-3 text-2xs leading-relaxed text-muted-foreground"><ChartLine aria-hidden className="mt-px size-3.5 shrink-0" />
						<span>Phaseo's figures are what the gateway charged. Claude Code and Codex are read from their transcripts on this computer, wherever they ran, and priced at Phaseo's catalogue rates; their plan limits are under Limits. Transcript folders are in Settings, under Usage sources.{recordedFrom ? ` Usage is recorded from ${recordedFrom}.` : ""}</span></p>
				</div>}
		</ScrollArea>
	</div>;
}

/** The harness of a Claude Code or Codex session run outside Phaseo (`session:<harness>:<id>`). */
const sessionHarness = (taskId: string) => taskId.startsWith("session:") ? taskId.split(":")[1] : undefined;

/** The breakdown list: models, chats, projects, or each day (hour today), largest first; days newest first. */
function BreakdownRows({ report, breakdown, metric, amount, other, sortKey, chatName, projectName, onChat }: {
	report: UsageReport; breakdown: Breakdown; metric: "cost" | "tokens"; amount: (cost: UsageCost) => string; other: (cost: UsageCost) => string; sortKey: (cost: UsageCost) => number;
	chatName: (id: string) => string | undefined; projectName: (id: string) => string | undefined; onChat: (id: string) => (() => void) | undefined;
}) {
	const one = (harness: string, cost: UsageCost) => [{ harness, amount: sortKey(cost) }];
	if (breakdown === "models") {
		const rows = report.models.slice().sort((a, b) => sortKey(b) - sortKey(a));
		return <Group Icon={Boxes} label="Models" count={rows.length || undefined}>
			{rows.map(row => <Share key={`${row.harness}:${row.model}`} harness={row.harness} name={modelName(row.model)} amount={row.costNanos || metric === "tokens" ? amount(row) : row.unpricedTokens ? "Unpriced" : amount(row)} detail={other(row)} largest={sortKey(rows[0])} parts={one(row.harness, row)} />)}
			{!rows.length && <p className="px-3 py-2 text-xs text-muted-foreground">No model was used in this period.</p>}
		</Group>;
	}
	if (breakdown === "chats") return <Group Icon={MessageSquare} label="Chats" count={report.chats.length || undefined}>
		{report.chats.map(chat => <Share key={chat.taskId} harness={sessionHarness(chat.taskId)} name={chatName(chat.taskId) ?? (sessionHarness(chat.taskId) ? `${harnessName(sessionHarness(chat.taskId)!)} session${chat.label ? ` in ${chat.label}` : ""}` : "A deleted chat")} amount={amount(chat)} detail={other(chat)} largest={sortKey(report.chats[0])} onOpen={onChat(chat.taskId)} parts={[{ harness: "", amount: sortKey(chat) }]} />)}
		{!report.chats.length && <p className="px-3 py-2 text-xs text-muted-foreground">No chat used anything in this period.</p>}
	</Group>;
	if (breakdown === "projects") return <Group Icon={FolderOpen} label="Projects" count={report.projects.length || undefined}>
		{report.projects.map(project => <Share key={project.projectId ?? `folder:${project.folder ?? ""}`} name={project.projectId ? projectName(project.projectId) ?? "A removed project" : project.folder ? `${project.folder} (not a project)` : "No project"} amount={amount(project)} detail={other(project)} largest={sortKey(report.projects[0])} parts={[{ harness: "", amount: sortKey(project) }]} />)}
		{!report.projects.length && <p className="px-3 py-2 text-xs text-muted-foreground">No project used anything in this period.</p>}
	</Group>;
	const labels = bucketLabels(report);
	const rows = report.buckets.map((bucket, index) => {
		const harnesses = Object.entries(bucket.harnesses), total = harnesses.reduce((sum, [, cost]) => ({ ...sum, tokens: sum.tokens + cost.tokens, costNanos: sum.costNanos + cost.costNanos }), { tokens: 0, costNanos: 0, chargedNanos: 0, estimateNanos: 0, unpricedTokens: 0 });
		return { label: labels[index].long, total, parts: harnesses.map(([harness, cost]) => ({ harness, amount: sortKey(cost) })) };
	}).filter(row => row.total.tokens > 0).reverse();
	const largest = Math.max(0, ...rows.map(row => sortKey(row.total)));
	return <Group Icon={CalendarDays} label={report.period === "today" ? "Hours" : "Days"} count={rows.length || undefined}>
		{rows.map(row => <Share key={row.label} name={row.label} amount={amount(row.total)} detail={other(row.total)} largest={largest} parts={row.parts} />)}
		{!rows.length && <p className="px-3 py-2 text-xs text-muted-foreground">Nothing was used in this period.</p>}
	</Group>;
}
