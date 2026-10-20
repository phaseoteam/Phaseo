import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Plane } from "lucide-react";
import { inboxLists, type AutopilotDecision } from "../../shared/inbox";
import { chatSpend } from "../../shared/chatSpend";
import { shortDuration } from "../../shared/threadLifecycle";
import { formatCost } from "../../shared/usageAmounts";
import type { TaskOverview } from "../../shared/workspaceOverview";
import { errorText, useWorkspace } from "../app/workspace";
import { ScrollArea } from "../components/ui/scroll-area";
import { useWorkspacePreferences } from "../lib/workspacePreferences";
import { cn } from "../lib/utils";
import { SettingsNote, SettingsPageLayout } from "../settings/SettingsLayout";

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

const ago = (at: string, now: number) => { const value = shortDuration(now - Date.parse(at)); return value === "now" ? "just now" : `${value} ago`; };
const statusText: Partial<Record<TaskOverview["status"], string>> = { running: "Working", waiting: "Waiting for you", idle: "Queued", completed: "Checking the turn", interrupted: "Stopped", failed: "Failed", limited: "Usage limit reached" };
const stopped = (task: TaskOverview) => task.status === "failed" || task.status === "interrupted";

/** A list on the Inbox page: a heading, then rows divided by rules. */
function InboxSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
	return <section aria-label={title} className="flex flex-col gap-2">
		<div className="px-0.5"><h2 className="text-[13.5px] font-bold">{title}</h2>{description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}</div>
		<div className="flex flex-col divide-y divide-border border-y border-border">{children}</div>
	</section>;
}

function InboxRow({ onOpen, children, label }: { onOpen: () => void; children: ReactNode; label: string }) {
	return <button type="button" aria-label={label} onClick={onOpen} className="flex w-full flex-col gap-1 rounded-md px-3 py-2.5 text-left text-[13px] outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/40">{children}</button>;
}

/**
 * The Inbox: every chat and agent waiting on the person, wherever it is, then (with Autopilot) the chats it is running
 * and a log of what it decided for them. Each row opens its chat.
 */
export function Inbox() {
	const { overview, select } = useWorkspace();
	const preferences = useWorkspacePreferences();
	const { log, error } = useAutopilotLog();
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
	const { needsYou, inAutopilot } = useMemo(() => inboxLists(overview.tasks, now), [overview.tasks, now]);
	const byId = useMemo(() => new Map(overview.tasks.map(task => [task.id, task])), [overview.tasks]);
	const where = (task: TaskOverview) => {
		const parent = task.delegation?.parentTaskId ? byId.get(task.delegation.parentTaskId) : undefined;
		if (parent) return `Agent in ${parent.title}`;
		return overview.projects.find(project => project.id === task.projectId)?.name ?? "Chat";
	};
	const autopilot = preferences.autopilot || inAutopilot.length > 0 || log.length > 0;
	return <ScrollArea className="h-full">
		<SettingsPageLayout title="Inbox" description="Everything waiting on you, across chats and agents.">
			<InboxSection title={needsYou.length ? `Needs you (${needsYou.length})` : "Needs you"}>
				{needsYou.length ? needsYou.map(task => {
					const handback = task.autopilot?.handback;
					return <InboxRow key={task.id} label={`${task.title}: ${task.attentionReason}`} onOpen={() => select(task.id)}>
						<span className="flex items-center gap-2">
							<span className={cn("size-2 shrink-0 rounded-full", stopped(task) ? "bg-destructive" : "bg-warning")} />
							<span className="min-w-0 flex-1 truncate font-medium">{task.title}</span>
							<span className="shrink-0 text-xs text-muted-foreground">{ago(task.updatedAt, now)}</span>
						</span>
						<span className="ml-4 flex min-w-0 gap-1.5 text-xs text-muted-foreground"><span className={cn("shrink-0 font-medium", stopped(task) ? "text-destructive" : "text-warning")}>{task.attentionReason}</span><span>·</span><span className="truncate">{where(task)}</span></span>
						{handback && handback.reason !== "done" && <span className="ml-4 line-clamp-2 text-xs text-muted-foreground">{handback.summary}</span>}
					</InboxRow>;
				}) : <p className="px-3 py-3 text-[13px] text-muted-foreground">Nothing needs you right now.</p>}
			</InboxSection>
			{autopilot && <InboxSection title="In Autopilot" description="Chats Autopilot is running until it judges them done or needs you.">
				{inAutopilot.length ? inAutopilot.map(task => {
					const { own, agents } = chatSpend(overview.tasks, task.id), spent = (own?.costNanos ?? 0) + agents.costNanos, cap = task.autopilot!.capNanos;
					return <InboxRow key={task.id} label={`${task.title}, in Autopilot`} onOpen={() => select(task.id)}>
						<span className="flex items-center gap-2">
							<Plane className="size-3.5 shrink-0 text-warning" />
							<span className="min-w-0 flex-1 truncate font-medium">{task.title}</span>
							<span className="shrink-0 text-xs text-muted-foreground tabular-nums">{cap === null ? `${formatCost(spent)}, no cap` : `${formatCost(spent)} of ${formatCost(cap)}`}</span>
						</span>
						<span className="ml-5.5 text-xs text-muted-foreground">{[statusText[task.status], where(task), `since ${ago(task.autopilot!.since, now)}`].filter(Boolean).join(" · ")}</span>
					</InboxRow>;
				}) : <p className="px-3 py-3 text-[13px] text-muted-foreground">No chat is in Autopilot.</p>}
			</InboxSection>}
			{autopilot && <InboxSection title="Autopilot log" description="What Autopilot decided for you, newest first.">
				{error && <SettingsNote tone="error" role="alert">{error}</SettingsNote>}
				{log.length ? log.map(entry => {
					const task = byId.get(entry.taskId);
					return <InboxRow key={entry.id} label={`${entry.title} in ${task?.title ?? "a deleted chat"}`} onOpen={() => { if (task) select(task.id); }}>
						<span className="flex items-center gap-2">
							<span className="min-w-0 flex-1 truncate"><span className="font-medium">{entry.title}</span><span className="text-muted-foreground"> in {task?.title ?? "a deleted chat"}</span></span>
							<span className="shrink-0 text-xs text-muted-foreground" title={new Date(entry.at).toLocaleString()}>{ago(entry.at, now)}</span>
						</span>
						<span className="line-clamp-3 text-xs whitespace-pre-line text-muted-foreground">{entry.text}</span>
					</InboxRow>;
				}) : <p className="px-3 py-3 text-[13px] text-muted-foreground">Autopilot hasn't decided anything yet.</p>}
			</InboxSection>}
		</SettingsPageLayout>
	</ScrollArea>;
}
