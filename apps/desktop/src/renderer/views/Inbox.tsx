import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { CircleCheck, CirclePause, CircleQuestionMark, CircleX, ClipboardCheck, Gauge, Hand, History, Hourglass, Inbox as InboxIcon, ListChecks, ListTodo, MessageSquareText, Plane, Repeat, Reply, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { inboxLists, type AutopilotDecision } from "../../shared/inbox";
import { chatSpend } from "../../shared/chatSpend";
import { formatSpend } from "../../shared/usageAmounts";
import type { TaskOverview } from "../../shared/workspaceOverview";
import { errorText, useWorkspace } from "../app/workspace";
import { Button } from "../components/ui/button";
import { ScrollArea } from "../components/ui/scroll-area";
import { useWorkspacePreferences } from "../lib/workspacePreferences";
import { cn } from "../lib/utils";
import { formatAgoShort, formatDateTime, formatRelativeTime } from "@phaseo/app-kit/format";

/** Autopilot's latest decisions across chats, read again whenever it makes one. */
export function useAutopilotLog() {
	const api = window.phaseoDesktop?.workspace;
	const [log, setLog] = useState<AutopilotDecision[]>([]);
	const [error, setError] = useState("");
	useEffect(() => {
		if (!api) return;
		let active = true;
		const load = () => void api.autopilotLog().then(value => { if (active) { setLog(value); setError(""); } }, reason => { if (active) setError(errorText(reason)); });
		load();
		const unsubscribe = api.onAutopilotLogChange(load);
		return () => { active = false; unsubscribe(); };
	}, [api]);
	return { log, error };
}

export type Glyph = { Icon: ComponentType<{ className?: string }>; tone?: string };
const attention = "text-warning";
/** Each reason a chat waits on the person gets its own mark; only the mark carries colour. */
const reasonGlyphs: Record<string, Glyph> = {
	"Approval needed": { Icon: ShieldAlert, tone: attention },
	"Answer needed": { Icon: CircleQuestionMark, tone: attention },
	"Review pending instruction": { Icon: MessageSquareText, tone: attention },
	"Autopilot needs you": { Icon: Hand, tone: attention },
	"Spend cap reached": { Icon: Gauge, tone: attention },
	"Waiting for you": { Icon: Hourglass, tone: attention },
	"Usage limit reached": { Icon: Gauge, tone: attention },
	"Task failed": { Icon: CircleX, tone: "text-destructive" },
	"Task interrupted": { Icon: CirclePause },
};
const statusText: Partial<Record<TaskOverview["status"], string>> = { running: "Working", waiting: "Waiting for you", idle: "Queued", completed: "Checking the turn", interrupted: "Stopped", failed: "Failed", limited: "Usage limit reached" };

/** The log stores what the chat shows ("Autopilot answered"); here the heading already says Autopilot. */
function decisionGlyph(title: string): Glyph & { label: string } {
	const rest = title.replace(/^Autopilot:?\s*/, "");
	const label = rest === "keep going" ? "Kept going" : rest === "needs you" ? "Handed back" : rest.charAt(0).toUpperCase() + rest.slice(1);
	const Icon = /^answered/.test(rest) ? Reply : /^filled/.test(rest) ? ClipboardCheck : /^approved the plan/.test(rest) ? ListChecks : /plan$/.test(rest) ? ListTodo
		: /^allowed/.test(rest) ? ShieldCheck : /^declined/.test(rest) ? ShieldX : /^keep going/.test(rest) ? Repeat : /^finished/.test(rest) ? CircleCheck
			: /spend cap/.test(rest) ? Gauge : /needs you|passed this/.test(rest) ? Hand : Plane;
	return { Icon, label, tone: Icon === Hand || Icon === Gauge ? attention : Icon === CircleCheck ? "text-success" : undefined };
}

export function Group({ Icon, label, count, children }: { Icon: ComponentType<{ className?: string }>; label: string; count?: number; children: ReactNode }) {
	return <section aria-label={label} className="flex flex-col gap-0.5">
		<div className="flex items-center gap-2 px-3 pb-1 text-xs font-medium text-muted-foreground/70"><Icon aria-hidden className="size-3.5 shrink-0" /><h2 className="shrink-0">{label}</h2>{count !== undefined && <span className="shrink-0 text-muted-foreground/50 tabular-nums">{count}</span>}<span aria-hidden className="h-px min-w-2 flex-1 bg-border/60" /></div>
		{children}
	</section>;
}

/** One line of the Inbox, shaped like a pull request row: a mark, the title over its details, and the time. */
export function Row({ glyph, title, meta, aside, detail, label, onOpen }: { glyph: Glyph; title: ReactNode; meta?: ReactNode; aside: ReactNode; detail?: string; label: string; onOpen?: () => void }) {
	return <button type="button" aria-label={label} disabled={!onOpen} onClick={onOpen} className="flex w-full items-start gap-2.5 rounded-md px-3 py-2 text-left transition-colors outline-none hover:bg-accent/60 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset disabled:hover:bg-transparent">
		<glyph.Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground", glyph.tone)} />
		<span className="min-w-0 flex-1">
			<span className="flex min-w-0 items-center gap-2"><span className="min-w-0 flex-1 truncate text-sm">{title}</span><span className="shrink-0 text-2xs whitespace-nowrap text-muted-foreground tabular-nums">{aside}</span></span>
			{meta && <span className="flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground">{meta}</span>}
			{detail && <span title={detail} className="mt-0.5 line-clamp-2 text-xs leading-relaxed whitespace-pre-line text-muted-foreground">{detail}</span>}
		</span>
	</button>;
}
export const Dot = () => <span aria-hidden className="text-muted-foreground/50">·</span>;
const logPage = 30;

/**
 * The Inbox: every chat and agent waiting on the person, wherever it is, then (with Autopilot) the chats it is running
 * and a log of what it decided for them. Each row opens its chat.
 */
export function Inbox() {
	const { overview, select } = useWorkspace();
	const preferences = useWorkspacePreferences();
	const { log, error } = useAutopilotLog();
	const [now, setNow] = useState(() => Date.now());
	const [shown, setShown] = useState(logPage);
	useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
	const { needsYou, inAutopilot } = useMemo(() => inboxLists(overview.tasks, now), [overview.tasks, now]);
	const byId = useMemo(() => new Map(overview.tasks.map(task => [task.id, task])), [overview.tasks]);
	const where = (task: TaskOverview) => {
		const parent = task.delegation?.parentTaskId ? byId.get(task.delegation.parentTaskId) : undefined;
		if (parent) return `Agent in ${parent.title}`;
		return overview.projects.find(project => project.id === task.projectId)?.name ?? "Chat";
	};
	const autopilot = preferences.autopilot || inAutopilot.length > 0 || log.length > 0;
	const empty = !needsYou.length && !inAutopilot.length && !log.length;
	return <div className="flex h-full min-h-0 w-full flex-col bg-background" data-inbox-page="">
		<header className="flex h-10 min-h-10 shrink-0 items-center gap-2 border-b border-border/60 px-4">
			<h1 className="text-xs font-medium">Inbox</h1>
			<span className="min-w-0 truncate text-2xs text-muted-foreground">{needsYou.length ? `${needsYou.length} waiting on you` : "Nothing waiting on you"}</span>
		</header>
		{error && <p role="alert" className="shrink-0 border-b border-border/60 px-4 py-1.5 text-xs text-destructive">{error}</p>}
		<ScrollArea className="min-h-0 flex-1">
			{empty ? <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
				<InboxIcon aria-hidden className="size-7 text-muted-foreground/50" />
				<div className="space-y-1"><p className="text-sm font-medium">You're all caught up</p><p className="mx-auto max-w-80 text-xs text-muted-foreground">Chats and agents that need an answer, an approval or a look appear here, from both Chat and Code.</p></div>
			</div> : <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-4 pb-8">
				<Group Icon={InboxIcon} label="Needs you" count={needsYou.length}>
					{needsYou.length ? needsYou.map(task => {
						const handback = task.autopilot?.handback;
						return <Row key={task.id} label={`${task.title}: ${task.attentionReason}`} onOpen={() => select(task.id)}
							glyph={reasonGlyphs[task.attentionReason!] ?? { Icon: Hourglass, tone: attention }} title={task.title} aside={formatAgoShort(task.updatedAt, now)}
							meta={<><span className="shrink-0 text-foreground/80">{task.attentionReason}</span><Dot /><span className="truncate">{where(task)}</span></>}
							detail={handback && handback.reason !== "done" ? handback.summary : undefined} />;
					}) : <p className="px-3 py-2 text-xs text-muted-foreground">Nothing needs you right now.</p>}
				</Group>
				{autopilot && inAutopilot.length > 0 && <Group Icon={Plane} label="In Autopilot" count={inAutopilot.length}>
					{inAutopilot.map(task => {
						const { own, agents } = chatSpend(overview.tasks, task.id), spent = (own?.costNanos ?? 0) + agents.costNanos, cap = task.autopilot!.capNanos;
						return <Row key={task.id} label={`${task.title}, in Autopilot`} onOpen={() => select(task.id)}
							glyph={{ Icon: Plane, tone: task.status === "running" ? "text-primary" : undefined }} title={task.title}
							aside={cap === null ? `${formatSpend(spent)} · no cap` : `${formatSpend(spent)} of ${formatSpend(cap)}`}
							meta={<><span className="shrink-0 text-foreground/80">{statusText[task.status] ?? "Running"}</span><Dot /><span className="truncate">{where(task)}</span><Dot /><span className="shrink-0">started {formatRelativeTime(task.autopilot!.since, now)}</span></>} />;
					})}
				</Group>}
				{autopilot && <Group Icon={History} label="Autopilot log">
					{log.length ? <>
						{log.slice(0, shown).map(entry => {
							const task = byId.get(entry.taskId), decision = decisionGlyph(entry.title);
							return <Row key={entry.id} label={`${entry.title} in ${task?.title ?? "a deleted chat"}`} onOpen={task ? () => select(task.id) : undefined}
								glyph={decision} title={<>{decision.label}<span className="text-muted-foreground"> in {task?.title ?? "a deleted chat"}</span></>}
								aside={<span title={formatDateTime(entry.at)}>{formatAgoShort(entry.at, now)}</span>} detail={entry.text} />;
						})}
						{log.length > shown && <Button size="xs" variant="ghost" className="mt-1 self-start text-muted-foreground" onClick={() => setShown(value => value + logPage)}>Show older decisions</Button>}
					</> : <p className="px-3 py-2 text-xs text-muted-foreground">Autopilot hasn't decided anything yet.</p>}
				</Group>}
			</div>}
		</ScrollArea>
	</div>;
}
