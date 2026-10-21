import { useEffect, useMemo, useState } from "react";
import { Boxes, ChartLine, CircleCheck, FolderOpen, Hourglass, MessageSquare, Plane } from "lucide-react";
import { inboxLists } from "../../shared/inbox";
import { formatCost } from "../../shared/usageAmounts";
import { localDay, todayPace, type TodayPace, type TodayReport, type UsageSpend } from "../../shared/usageLedger";
import { errorText, useWorkspace } from "../app/workspace";
import { modelLabel } from "../chat/ModelPicker";
import { ScrollArea } from "../components/ui/scroll-area";
import { cn } from "../lib/utils";
import { relativeTime } from "./pullRequests/pullRequestLogic";
import { Group, Row } from "./Inbox";

/** Money as people read it: $1.32, $0.51; only amounts under a cent keep more places, so they don't read as $0.00. */
const money = (nanos: number) => formatCost(nanos >= 1e7 ? Math.round(nanos / 1e7) * 1e7 : nanos);

/** The report, read on opening, when chats change (a turn adds spend) and every minute, at most every two seconds. */
function useTodayReport() {
	const { overview } = useWorkspace();
	const api = window.phaseoDesktop?.workspace;
	const [report, setReport] = useState<TodayReport>();
	const [error, setError] = useState("");
	const [tick, setTick] = useState(0);
	useEffect(() => { const timer = window.setInterval(() => setTick(value => value + 1), 60_000); return () => window.clearInterval(timer); }, []);
	useEffect(() => {
		if (!api) return;
		let active = true;
		const timer = window.setTimeout(() => void api.usageToday().then(value => { if (active) { setReport(value); setError(""); } }, reason => { if (active) setError(errorText(reason)); }), report ? 2000 : 0);
		return () => { active = false; window.clearTimeout(timer); };
	}, [api, overview, tick]);
	return { report, error };
}

/** How today compares with the usual by this time, in words. */
function paceText(today: number, pace: TodayPace) {
	if (!pace.basedOn) return "There are no earlier days to compare with yet.";
	if (!today && !pace.usualByNow) return "Nothing spent yet, and usually nothing by now either.";
	const difference = today - pace.usualByNow, percent = pace.usualByNow ? Math.round(Math.abs(difference) / pace.usualByNow * 100) : undefined;
	if (Math.abs(difference) < 0.005e9 && (percent ?? 0) < 5) return "About your usual for this time of day.";
	return `${money(Math.abs(difference))} ${difference > 0 ? "more" : "less"} than usual by now${percent !== undefined ? ` (${difference > 0 ? "+" : "−"}${percent}%)` : ""}.`;
}

function Figure({ label, spend, detail }: { label: string; spend: UsageSpend; detail?: string }) {
	return <div className="flex min-w-0 flex-col gap-0.5">
		<span className="text-2xs text-muted-foreground">{label}</span>
		<span className="text-base font-semibold tabular-nums">{money(spend.costNanos)}</span>
		<span className="truncate text-2xs text-muted-foreground tabular-nums">{detail ?? `${spend.tokens.toLocaleString("en-US")} tokens`}</span>
	</div>;
}

/**
 * Today's spend by the hour against an average recent day, both running totals so the gap is the pace. Labels are HTML
 * over a stretched SVG, so the lines can fill any width without distorting the text.
 */
function PaceChart({ pace, now }: { pace: TodayPace; now: Date }) {
	const [hover, setHover] = useState<number>();
	const at = now.getHours() + now.getMinutes() / 60;
	const today = [[0, 0], ...pace.cumulative.slice(0, -1).map((value, hour) => [hour + 1, value]), [at, pace.cumulative.at(-1) ?? 0]];
	const usual = [[0, 0], ...pace.usual.map((value, hour) => [hour + 1, value])];
	// Two gridlines at round amounts ($0.50, $1), the upper one at or above the highest point.
	const highest = Math.max(...today.map(point => point[1]), ...usual.map(point => point[1]), 1e7);
	const magnitude = 10 ** Math.floor(Math.log10(highest / 2)), step = [1, 2, 2.5, 5, 10].map(factor => factor * magnitude).find(value => value * 2 >= highest)!;
	const top = step * 2 * 1.08, grid = [step, step * 2];
	const x = (hours: number) => hours / 24 * 100, y = (nanos: number) => 100 - nanos / top * 100;
	const path = (points: number[][]) => points.map(([hours, nanos], index) => `${index ? "L" : "M"}${x(hours)},${y(nanos)}`).join(" ");
	const valueAt = (points: number[][], hours: number) => { const after = points.findIndex(point => point[0] >= hours); if (after <= 0) return points[Math.max(0, after)]?.[1] ?? 0; const [x0, y0] = points[after - 1], [x1, y1] = points[after]; return y0 + (y1 - y0) * ((hours - x0) / (x1 - x0 || 1)); };
	const last = today.at(-1)!;
	return <figure className="flex flex-col gap-2" aria-label="Spend today against your usual, by hour">
		<figcaption className="flex items-center gap-4 text-2xs text-muted-foreground">
			<span className="flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-3 rounded-sm bg-foreground" />Today</span>
			{pace.basedOn > 0 && <span className="flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-3 rounded-sm bg-muted-foreground/50" />Usual, averaged over {pace.basedOn === 1 ? "1 day" : `${pace.basedOn} days`}<span className="tabular-nums">· {money(usual.at(-1)![1])} a day</span></span>}
		</figcaption>
		<div className="relative mt-3 h-36" onMouseLeave={() => setHover(undefined)}
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

/** One line of a breakdown: the name, a thin bar against the largest, and the amount. */
function Share({ name, spend, largest, onOpen }: { name: string; spend: UsageSpend; largest: number; onOpen?: () => void }) {
	const content = <>
		<span className="min-w-0 flex-1 truncate text-sm">{name}</span>
		<span aria-hidden className="h-1 w-24 shrink-0 overflow-hidden rounded-sm bg-muted"><span className="block h-full rounded-sm bg-foreground/70" style={{ width: `${Math.max(2, spend.costNanos / (largest || 1) * 100)}%` }} /></span>
		<span className="w-20 shrink-0 text-right text-xs tabular-nums">{money(spend.costNanos)}</span>
	</>;
	const className = "flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-left";
	return onOpen ? <button type="button" onClick={onOpen} className={cn(className, "outline-none hover:bg-accent/60 focus-visible:ring-1 focus-visible:ring-ring")}>{content}</button> : <div className={className}>{content}</div>;
}

/**
 * Today: what Phaseo spent so far against an average recent day, the forecast to midnight, where it went (chats,
 * projects, models), Autopilot's share, and what finished or is waiting. Spend comes from the usage ledger; subscription
 * harnesses (Claude Code, Codex) aren't billed per request, so their limits stay in the sidebar's rings.
 */
export function Today() {
	const { overview, select, openInbox } = useWorkspace();
	const { report, error } = useTodayReport();
	const now = useMemo(() => new Date(report?.generatedAt ?? Date.now()), [report]);
	const pace = useMemo(() => report ? todayPace(report, now) : undefined, [report, now]);
	const startOfToday = useMemo(() => { const value = new Date(now); value.setHours(0, 0, 0, 0); return value.toISOString(); }, [now]);
	const byId = useMemo(() => new Map(overview.tasks.map(task => [task.id, task])), [overview.tasks]);
	const finished = useMemo(() => overview.tasks.filter(task => !task.archived && task.lastCompletedAt && task.lastCompletedAt >= startOfToday).sort((a, b) => b.lastCompletedAt!.localeCompare(a.lastCompletedAt!)), [overview.tasks, startOfToday]);
	const waiting = useMemo(() => inboxLists(overview.tasks).needsYou.length, [overview.tasks]);
	const date = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
	const recordedFrom = report?.since && localDay(new Date(report.since)) > localDay(new Date(now.getTime() - 7 * 86_400_000)) ? new Date(report.since).toLocaleDateString("en-GB", { day: "numeric", month: "long" }) : undefined;
	return <div className="flex h-full min-h-0 w-full flex-col bg-background" data-today-page="">
		<header className="flex h-10 min-h-10 shrink-0 items-center gap-2 border-b border-border/60 px-4">
			<h1 className="text-xs font-medium">Today</h1>
			<span className="min-w-0 truncate text-2xs text-muted-foreground">{date}</span>
		</header>
		{error && <p role="alert" className="shrink-0 border-b border-border/60 px-4 py-1.5 text-xs text-destructive">{error}</p>}
		<ScrollArea className="min-h-0 flex-1">
			{!report || !pace ? <p className="px-6 py-24 text-center text-xs text-muted-foreground">{error ? "" : "Adding up today…"}</p> : <div className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 pt-5 pb-10">
				<section aria-label="Spend today" className="flex flex-col gap-4 px-3">
					<div className="flex flex-col gap-1">
						<span className="text-xs text-muted-foreground">Spent through Phaseo today</span>
						<span className="text-4xl font-semibold tracking-tight tabular-nums">{money(report.today.costNanos)}</span>
						<p className="text-sm">{paceText(report.today.costNanos, pace)}</p>
						{pace.basedOn > 0 && <p className="text-xs text-muted-foreground tabular-nums">At your usual pace from here, about {money(pace.forecast)} by midnight · usual by now {money(pace.usualByNow)}</p>}
					</div>
					<div className="grid grid-cols-3 gap-6 border-t border-border/60 pt-3">
						<Figure label="Last 24 hours" spend={report.last24h} />
						<Figure label="Last 7 days" spend={report.last7d} />
						<Figure label="Autopilot today" spend={report.autopilotToday} detail={report.autopilotToday.chats ? `in ${report.autopilotToday.chats === 1 ? "1 chat" : `${report.autopilotToday.chats} chats`}` : "Not used today"} />
					</div>
				</section>
				<section aria-label="Pace" className="px-3"><PaceChart pace={pace} now={now} /></section>
				<Group Icon={MessageSquare} label="Chats" count={report.chats.length || undefined}>
					{report.chats.length ? report.chats.map(chat => { const task = byId.get(chat.taskId); return <Share key={chat.taskId} name={task?.title ?? "A deleted chat"} spend={chat} largest={report.chats[0].costNanos} onOpen={task ? () => select(task.id) : undefined} />; })
						: <p className="px-3 py-2 text-xs text-muted-foreground">No chat has spent anything through Phaseo today.</p>}
				</Group>
				{report.projects.length > 0 && <Group Icon={FolderOpen} label="Projects">
					{report.projects.map(project => <Share key={project.projectId ?? "none"} name={project.projectId ? overview.projects.find(value => value.id === project.projectId)?.name ?? "A removed project" : "No project"} spend={project} largest={report.projects[0].costNanos} />)}
				</Group>}
				{report.models.length > 0 && <Group Icon={Boxes} label="Models">
					{report.models.map(model => <Share key={model.model} name={modelLabel(model.model)} spend={model} largest={report.models[0].costNanos} />)}
				</Group>}
				<Group Icon={CircleCheck} label="Finished today" count={finished.length || undefined}>
					{waiting > 0 && <Row glyph={{ Icon: Hourglass, tone: "text-warning" }} label={`${waiting} waiting on you, open the Inbox`} onOpen={openInbox}
						title={waiting === 1 ? "1 chat is waiting on you" : `${waiting} chats are waiting on you`} aside="Inbox" />}
					{finished.length ? finished.slice(0, 12).map(task => <Row key={task.id} glyph={{ Icon: task.autopilot && !task.autopilot.inherited ? Plane : CircleCheck, tone: "text-success" }} label={`${task.title}, finished`} onOpen={() => select(task.id)}
						title={task.title} aside={relativeTime(task.lastCompletedAt!, now.getTime())} meta={overview.projects.find(project => project.id === task.projectId)?.name} />)
						: <p className="px-3 py-2 text-xs text-muted-foreground">Nothing has finished yet today.</p>}
				</Group>
				<p className="flex items-start gap-2 px-3 text-2xs leading-relaxed text-muted-foreground"><ChartLine aria-hidden className="mt-px size-3.5 shrink-0" />
					<span>Spend through Phaseo, priced by the gateway. Claude Code and Codex subscriptions aren't billed per request; their limits are in the rings at the bottom of the sidebar.{recordedFrom ? ` Spend is recorded from ${recordedFrom}.` : ""}</span></p>
			</div>}
		</ScrollArea>
	</div>;
}
