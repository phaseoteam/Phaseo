import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, Plane, Brain, Check, ChevronRight, Circle, CircleDot, CircleSlash, Copy, FilePen, FileText, FolderSearch, GitBranch, GitPullRequestArrow, Layers, ListChecks, LoaderCircle, Paperclip, PenLine, RotateCcw, Search, Sparkles, SquareTerminal, Wrench, X } from "lucide-react";
import { ScrollArea } from "../components/ui/scroll-area";
import { MessageNavigationRail, type RailTurn } from "./MessageNavigationRail";
import type { AgentActivity, Message, Task } from "../../shared/workspace";
import { useConversationPage } from "../lib/useConversationPage";
import { conversationTurns, turnDuration, type TurnEntry } from "../lib/conversationTurns";
import { contextShare, turnUsage } from "../lib/turnUsage";
import { formatCost } from "../../shared/usageAmounts";
import { cn } from "../lib/utils";
import { MessageContent } from "../components/MessageContent";
import { MessageText } from "../components/MessageChips";
import { ModelLogo } from "../components/ModelLogo";
import { useTextCopy } from "../components/useTextCopy";
import { mentionPlainText } from "../lib/mentions";
import { harnessNames, knownModel, modelLabel } from "./ModelPicker";
import { ModelInfoCard } from "./ModelInfoCard";
import { AgentResult } from "./AgentThreads";
import { ProposedPlan } from "./ProposedPlan";

const planOutcomes = { implemented: "Implemented", revised: "Revision requested", declined: "Not implemented" } as const;

const toolLabels: Record<string, string> = { run_command: "Ran", start_background_command: "Started", read_background_output: "Read output", stop_background_command: "Stopped", list_background_commands: "Listed commands", read_file: "Read", view_image: "Viewed", edit_file: "Edited", write_file: "Wrote", delete_file: "Deleted", list_files: "Listed", search_files: "Searched", find_files: "Found files", propose_plan: "Proposed plan", load_tools: "Loaded tools", load_skill: "Loaded skill", ask_user: "Asked" };
function toolIcon(title: string) {
	if (/command|terminal|bash|shell|run/i.test(title)) return SquareTerminal;
	if (/write|edit|patch|apply/i.test(title)) return FilePen;
	if (/read|open|view/i.test(title)) return FileText;
	if (/search|grep|find|glob/i.test(title)) return Search;
	if (/list|browse|ls/i.test(title)) return FolderSearch;
	if (/skill/i.test(title)) return Sparkles;
	return Wrench;
}

function ActionButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
	return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 [&_svg]:size-3.5">{children}</button>;
}

function CopyButton({ text }: { text: string }) {
	const { status, copying, copy } = useTextCopy(text);
	return <ActionButton label={status === "copied" ? "Copied" : "Copy"} disabled={copying || !text} onClick={() => void copy()}>{status === "copied" ? <Check /> : <Copy />}</ActionButton>;
}

function UserMessage({ message, projectId, onAttachment, onBranch, onRewind, canBranch }: { message: Message; projectId?: string; onAttachment: (id: string) => void; onBranch: (id: string) => void; onRewind?: (message: Message) => void; canBranch: boolean }) {
	return <div data-conversation-id={`message:${message.id}`} className="group/message flex flex-col items-end gap-1">
		{message.autopilot && <span title="Autopilot sent this to keep the task going" className="flex items-center gap-1 text-[11px] font-medium text-warning"><Plane className="size-3" />Autopilot</span>}
		<div data-selectable className="max-w-[85%] rounded-2xl rounded-br-md bg-muted px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap"><MessageText text={message.text} projectId={projectId} />
			{!!message.attachments?.length && <div className="mt-2 flex flex-wrap gap-1.5">{message.attachments.map(attachment => <button key={attachment.id} type="button" onClick={() => onAttachment(attachment.id)} className="inline-flex h-6 items-center gap-1 rounded-md bg-background/70 px-2 text-xs hover:bg-background"><Paperclip className="size-3" />{attachment.name}</button>)}</div>}
		</div>
		<div className="flex items-center opacity-0 transition-opacity group-hover/message:opacity-100">
			<span className="mr-1 text-[11px] text-muted-foreground">{new Date(message.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
			<CopyButton text={mentionPlainText(message.text)} />
			{onRewind && <ActionButton label="Edit from here" disabled={!canBranch} onClick={() => onRewind(message)}><PenLine /></ActionButton>}
			<ActionButton label="Branch from here" disabled={!canBranch} onClick={() => onBranch(message.id)}><GitBranch /></ActionButton>
		</div>
	</div>;
}

const noticeTones = { failed: "text-destructive", completed: "text-emerald-600 dark:text-emerald-300/90", updated: "text-muted-foreground" } as const;
/** A wake the app sent the agent (T3 shows these as a notification row): the one-line summary, with the full update on demand. */
function WatchNotice({ message }: { message: Message }) {
	const [open, setOpen] = useState(false), notice = message.notice!;
	return <div data-conversation-id={`message:${message.id}`} data-notice={notice.kind} className="text-[12.5px]">
		<button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="group/notice flex w-full min-w-0 items-center gap-2 rounded-md py-1 text-left text-muted-foreground hover:text-foreground">
			<GitPullRequestArrow aria-hidden className={cn("size-3.5 shrink-0", noticeTones[notice.outcome])} />
			<span className="min-w-0 truncate font-medium text-foreground/85">Pull request {notice.summary}</span>
			<span className="shrink-0 text-[11px]">{new Date(message.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
			<ChevronRight aria-hidden className={cn("size-3.5 shrink-0 opacity-0 transition group-hover/notice:opacity-100", open && "rotate-90 opacity-100")} />
		</button>
		{open && <div data-selectable className="mt-0.5 mb-2 ml-[7px] border-l border-border py-0.5 pl-4 text-[13px] whitespace-pre-wrap text-muted-foreground">{message.text}</div>}
	</div>;
}

function PlanSteps({ activity }: { activity: AgentActivity }) {
	const steps = activity.steps ?? [];
	const done = steps.filter(step => step.status === "completed").length;
	return <div className="py-1">
		<div className="mb-2 flex items-center gap-2 text-xs font-semibold"><ListChecks className="size-3.5 text-muted-foreground" />Plan<span className="font-normal text-muted-foreground">{done} of {steps.length} done</span></div>
		{activity.explanation && <p className="mb-2 text-xs text-muted-foreground">{activity.explanation}</p>}
		<ol className="space-y-1">{steps.map((step, index) => <li key={index} className={cn("flex items-start gap-2 text-[13px]", step.status === "completed" && "text-muted-foreground line-through decoration-muted-foreground/40", step.status === "cancelled" && "text-muted-foreground")}>
			{step.status === "completed" ? <Check className="mt-0.5 size-3.5 shrink-0 text-success" /> : step.status === "in_progress" ? <CircleDot className="mt-0.5 size-3.5 shrink-0 text-primary" /> : step.status === "cancelled" ? <CircleSlash className="mt-0.5 size-3.5 shrink-0" /> : <Circle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />}
			<span>{step.text}</span></li>)}</ol>
	</div>;
}

function ActivityRow({ activity, live }: { activity: AgentActivity; live: boolean }) {
	const [open, setOpen] = useState(false);
	if (activity.type === "usage") return null;
	if (activity.type === "plan" && activity.steps?.length) return <PlanSteps activity={activity} />;
	const reasoning = activity.type === "reasoning";
	const running = activity.status === "running" || (reasoning && live);
	const Icon = reasoning ? Brain : activity.type === "compaction" ? Layers : activity.type === "plan" ? ListChecks : toolIcon(activity.title);
	const label = reasoning ? (running ? "Thinking" : "Thought") : activity.type === "compaction" ? "Compacted context" : toolLabels[activity.title] ?? activity.title.replaceAll("_", " ");
	const summary = reasoning ? "" : activity.text.split("\n")[0];
	const expandable = !!activity.text && (reasoning || activity.text.length > summary.length || activity.text.length > 80);
	return <div className="text-[12.5px]">
		<button type="button" disabled={!expandable} onClick={() => setOpen(value => !value)} aria-expanded={open} className="group/activity flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground">
			{running ? <LoaderCircle className="size-3.5 shrink-0 animate-spin text-primary" /> : <Icon className={cn("size-3.5 shrink-0 text-muted-foreground", activity.status === "failed" && "text-destructive")} />}
			<span className={cn("shrink-0 font-medium text-foreground/85", running && "animate-pulse")}>{label}</span>
			{summary && <span className="min-w-0 truncate font-mono text-[11.5px] text-muted-foreground">{summary}</span>}
			{activity.status === "failed" && <X className="size-3.5 shrink-0 text-destructive" />}
			{expandable && <ChevronRight className={cn("size-3.5 shrink-0 opacity-0 transition group-hover/activity:opacity-100", open && "rotate-90 opacity-100")} />}
		</button>
		{open && <ScrollArea className="mt-0.5 mb-2 ml-[15px] max-h-72 border-l border-border" viewportClassName="max-h-72"><div data-selectable className={cn("py-0.5 pl-4", reasoning ? "text-[13px] text-muted-foreground" : "font-mono text-[11.5px] whitespace-pre-wrap")}>{reasoning ? <MessageContent text={activity.text} /> : activity.text}</div></ScrollArea>}
	</div>;
}

function WorkLog({ entries, user, live, complete, task }: { entries: TurnEntry[]; user?: Message; live: boolean; complete: boolean; task: Task }) {
	const [open, setOpen] = useState(live);
	useEffect(() => { setOpen(live); }, [live]);
	const steps = entries.filter(entry => entry.kind === "activity" ? entry.value.type !== "usage" : true);
	if (!steps.length) return null;
	const tools = entries.filter(entry => entry.kind === "activity" && entry.value.type === "tool").length;
	const plan = entries.find(entry => entry.kind === "activity" && entry.value.type === "plan" && entry.value.steps?.length);
	const onlyReasoning = steps.every(entry => entry.kind === "activity" && entry.value.type === "reasoning");
	const title = live || !complete ? "Working" : onlyReasoning ? turnDuration(user).replace("Worked", "Thought") : turnDuration(user);
	return <div className="flex flex-col gap-1">
		<div>
			<button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="flex items-center gap-1.5 py-1 text-[13px] text-muted-foreground hover:text-foreground">
				{live ? <LoaderCircle className="size-3.5 animate-spin text-primary" /> : <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />}
				<span className={cn("font-medium", live && "animate-pulse")}>{title}</span>
				{tools > 0 && <span>· {tools} {tools === 1 ? "step" : "steps"}</span>}
			</button>
			{open && <div className="mt-1 ml-[7px] flex flex-col gap-0.5 border-l border-border pl-1.5">{steps.map(entry => entry.kind === "activity"
				? <ActivityRow key={entry.value.id} activity={entry.value} live={live} />
				: <div key={entry.value.id} data-selectable className="px-2 py-1 text-[13px] text-foreground/85"><MessageContent text={entry.value.text} projectId={task.projectId} repairLocalLinks /></div>)}</div>}
		</div>
		{!open && plan?.kind === "activity" && <PlanSteps activity={plan.value} />}
	</div>;
}

function AssistantHeader({ task }: { task: Task }) {
	const model = knownModel(task.model);
	return <div className="flex items-center gap-2 text-[13px] font-semibold">
		<span className="flex size-5 items-center justify-center [&_img]:size-4.5 [&_.harness-logo]:size-4.5"><ModelLogo model={model ?? { id: task.model, name: task.model }} harness={task.harness} /></span>
		<ModelInfoCard harness={task.harness} model={task.model}>{task.model === "default" ? harnessNames[task.harness] : model?.name ?? modelLabel(task.model)}</ModelInfoCard>
		<span className="font-medium text-muted-foreground">{task.harness === "phaseo" ? "via Phaseo" : `in ${harnessNames[task.harness]}`}</span>
	</div>;
}

const noActivities: AgentActivity[] = [];
type TurnProps = { user?: Message; entries: TurnEntry[]; usageActivities: AgentActivity[]; live: boolean; complete: boolean; task: Task; onAttachment: (id: string) => void; onBranch: (id: string) => void; onRewind?: (message: Message) => void; /** Offers Regenerate on this turn's answer (the last turn of a Chat-mode chat). */ onRegenerate?: (message: Message) => void; compact?: boolean };
const sameItems = <T,>(a: readonly T[], b: readonly T[], value: (item: T) => unknown = item => item) => a.length === b.length && a.every((item, index) => value(item) === value(b[index]));
/**
 * A turn re-renders only when its own entries or the chat fields it shows change, so loading a page of older turns
 * renders those turns alone. The callbacks are stable (see Conversation).
 */
const Turn = memo(function Turn({ user, entries, usageActivities, live, complete, task, onAttachment, onBranch, onRewind, onRegenerate, compact }: TurnProps) {
	// Text after the last step is the answer, even while it is still streaming.
	const latest = entries.findLast(entry => !(entry.kind === "activity" && entry.value.type === "usage"));
	const isAnswer = (entry?: TurnEntry) => entry?.kind === "message" && entry.value.role === "assistant" && entry.value.delivery !== "subagent";
	const final = isAnswer(latest) ? latest : complete && !live ? entries.findLast(entry => entry.kind === "message" && entry.value.role === "assistant") : undefined;
	// Proposed plans stand on their own in the turn, as T3 Code's plan card does, rather than inside the work log.
	const plans = entries.flatMap(entry => entry.kind === "activity" && entry.value.proposed ? [entry.value] : []);
	const work = entries.filter(entry => entry !== final && !(entry.kind === "message" && entry.value.delivery === "subagent") && !(entry.kind === "activity" && entry.value.proposed));
	const delegated = entries.filter(entry => entry.kind === "message" && entry.value.delivery === "subagent");
	// The timeline omits usage reports, so read them from the turn's activities.
	const usage = turnUsage(usageActivities), context = contextShare(usageActivities);
	const canBranch = !["running", "waiting"].includes(task.status) && !task.archived;
	const hasAssistant = work.length > 0 || plans.length > 0 || !!final || live;
	return <div data-turn-id={user && user.delivery !== "subagent" && !user.notice ? user.id : undefined} className="flex flex-col gap-4">
		{user && (user.notice ? <WatchNotice message={user} /> : user.delivery === "subagent" ? <AgentResult message={user} projectId={task.projectId} /> : <UserMessage message={user} projectId={task.projectId} onAttachment={onAttachment} onBranch={onBranch} onRewind={onRewind} canBranch={canBranch} />)}
		{hasAssistant && <div data-conversation-id={`turn:${user?.id ?? entries[0]?.value.id}`} className="group/turn flex flex-col gap-3">
			{!compact && <AssistantHeader task={task} />}
			<WorkLog entries={work} user={user} live={live} complete={complete} task={task} />
			{plans.map(plan => <ProposedPlan key={plan.id} markdown={plan.text} projectId={task.projectId} status={plan.proposed?.outcome ? planOutcomes[plan.proposed.outcome] : undefined}>
				{plan.proposed?.feedback && <p data-selectable className="mt-2 border-l-2 border-border pl-3 text-[13px] whitespace-pre-wrap text-muted-foreground">{plan.proposed.feedback}</p>}
			</ProposedPlan>)}
			{live && !final && !work.some(entry => entry.kind === "message" || entry.value.type !== "usage") && <div className="flex items-center gap-1.5 py-1 text-[13px] text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin text-primary" /><span className="animate-pulse font-medium">Working</span></div>}
			{delegated.map(entry => <details key={entry.value.id} className="rounded-xl border border-border px-3 py-2 text-[13px]"><summary className="cursor-pointer font-medium text-muted-foreground">Agent result</summary><MessageContent text={entry.value.text} projectId={task.projectId} /></details>)}
			{final?.kind === "message" && <div data-selectable data-conversation-id={`message:${final.value.id}`} className="text-[14px] leading-relaxed"><MessageContent text={final.value.text} projectId={task.projectId} repairLocalLinks /></div>}
			{final?.kind === "message" && !live && <div className="-ml-1.5 flex items-center gap-0.5 opacity-60 transition-opacity group-hover/turn:opacity-100">
				<CopyButton text={final.value.text} />
				{onRegenerate && user && <ActionButton label="Regenerate" disabled={!canBranch} onClick={() => onRegenerate(user)}><RotateCcw /></ActionButton>}
				<ActionButton label="Branch from this answer" disabled={!canBranch} onClick={() => onBranch(final.value.id)}><GitBranch /></ActionButton>
				{usage.Total !== undefined && <span className="ml-2 font-mono text-[11px] text-muted-foreground">{new Intl.NumberFormat(undefined, { notation: "compact" }).format(usage.Total)} tokens</span>}
				{usage.Cost !== undefined && usage.Cost > 0 && <span title="What this answer cost, as the Phaseo gateway priced it." className="font-mono text-[11px] text-muted-foreground">· {formatCost(usage.Cost)}</span>}
				{context !== undefined && <span title="How much of the model's context window the conversation used at the end of this turn. Phaseo compacts it automatically when it nears the limit." className={cn("font-mono text-[11px]", context >= 0.8 ? "text-warning" : "text-muted-foreground")}>· {Math.round(context * 100)}% of context</span>}
			</div>}
		</div>}
	</div>;
}, (a, b) => a.user === b.user && a.live === b.live && a.complete === b.complete && a.compact === b.compact && a.onRewind === b.onRewind && a.onRegenerate === b.onRegenerate
	&& sameItems(a.entries, b.entries, entry => entry.value) && sameItems(a.usageActivities, b.usageActivities)
	&& a.task.id === b.task.id && a.task.status === b.task.status && a.task.archived === b.task.archived && a.task.projectId === b.task.projectId && a.task.model === b.task.model && a.task.harness === b.task.harness);

export function Conversation({ task, onAttachment, onBranch, onRewind, onRegenerate, children, compact, className }: { task: Task; onAttachment: (id: string) => void; onBranch: (id: string) => void; onRewind?: (message: Message) => void; onRegenerate?: (message: Message) => void; children?: ReactNode; compact?: boolean; className?: string }) {
	const host = useRef<HTMLDivElement>(null);
	const content = useRef<HTMLDivElement>(null);
	const following = useRef(true);
	const anchor = useRef<{ id?: string; top: number; scroll: number } | undefined>(undefined);
	const [showLatest, setShowLatest] = useState(false);
	// Message pages carry their turns' activities, so steps arrive with the messages they belong to.
	const messages = useConversationPage(task, "messages", following, remember);
	const activityEntries = useMemo(() => messages.page.activities ?? [], [messages.page.activities]);
	const turns = useMemo(() => conversationTurns(messages.page.entries as Message[], activityEntries), [messages.page.entries, activityEntries]);
	const earlierRow = useRef<HTMLButtonElement>(null), newerRow = useRef<HTMLButtonElement>(null), lastScroll = useRef(0);
	// Turns are memoised, so they get stable callbacks that always call the latest ones.
	const handlers = useRef({ onAttachment, onBranch, onRewind, onRegenerate }); handlers.current = { onAttachment, onBranch, onRewind, onRegenerate };
	const attach = useCallback((id: string) => handlers.current.onAttachment(id), []), branchFrom = useCallback((id: string) => handlers.current.onBranch(id), []);
	const rewindTo = useCallback((message: Message) => handlers.current.onRewind?.(message), []), regenerate = useCallback((message: Message) => handlers.current.onRegenerate?.(message), []);
	const usageByTurn = useMemo(() => {
		const byTurn = new Map<string, AgentActivity[]>();
		for (const activity of activityEntries) if (activity.type === "usage") { const owner = activity.id.slice(0, Math.max(0, activity.id.indexOf(":"))); byTurn.set(owner, [...byTurn.get(owner) ?? [], activity]); }
		return byTurn;
	}, [activityEntries]);
	const activeTurn = task.messages.findLast(message => message.role === "user")?.id;
	const running = ["running", "waiting"].includes(task.status);
	const view = { ...task, messages: messages.page.entries as Message[], activities: activityEntries as AgentActivity[] };
	const railTurns = useMemo<RailTurn[]>(() => turns.flatMap(turn => !turn.user || turn.user.delivery === "subagent" || turn.user.notice ? [] : [{
		id: turn.user.id, user: turn.user.text, attachments: turn.user.attachments?.map(attachment => attachment.name) ?? [],
		assistant: turn.entries.findLast(entry => entry.kind === "message" && entry.value.role === "assistant" && entry.value.delivery !== "subagent")?.value.text,
	}]), [turns]);

	function remember() {
		const element = host.current;
		if (!element) return;
		following.current = false;
		const top = element.getBoundingClientRect().top;
		const visible = (selector: string) => Array.from(element.querySelectorAll<HTMLElement>(selector)).find(value => value.getBoundingClientRect().bottom >= top);
		// Messages keep their ids across pages; turn containers are regrouped as older entries arrive, so they anchor only as a fallback.
		const entry = visible('[data-conversation-id^="message:"]') ?? visible("[data-conversation-id]");
		anchor.current = { id: entry?.dataset.conversationId, top: entry?.getBoundingClientRect().top ?? top, scroll: element.scrollTop };
	}
	function update() {
		const element = host.current;
		if (!element) return;
		const latest = !messages.page.later && element.scrollHeight - element.clientHeight - element.scrollTop <= 64;
		following.current = latest; setShowLatest(!latest);
	}
	useLayoutEffect(() => {
		const element = host.current;
		if (!element) return;
		if (anchor.current) {
			const saved = anchor.current;
			const entry = saved.id ? element.querySelector<HTMLElement>(`[data-conversation-id="${CSS.escape(saved.id)}"]`) : null;
			element.scrollTop = entry ? element.scrollTop + entry.getBoundingClientRect().top - saved.top : saved.scroll;
			anchor.current = undefined;
		} else if (following.current) element.scrollTop = element.scrollHeight;
		// Programmatic scrolling is not the reader's: it must not page further.
		lastScroll.current = element.scrollTop;
	}, [task, messages.page]);
	// Pages load 50 at a time as the reader nears either end of the window (a screen ahead), in the direction they are
	// moving. The rows stay as buttons for keyboards, and for a window too short to scroll.
	useEffect(() => {
		const element = host.current;
		if (!element || (window as { __phaseoManualPaging?: boolean }).__phaseoManualPaging) return;
		const near = (row: HTMLElement | null) => { if (!row) return false; const view = element.getBoundingClientRect(), bounds = row.getBoundingClientRect(); return bounds.bottom >= view.top - view.height && bounds.top <= view.bottom + view.height; };
		const page = (direction: number) => {
			if (messages.loading) return;
			if (direction < 0 && messages.page.earlier > 0 && near(earlierRow.current)) messages.older();
			else if (direction > 0 && messages.page.later > 0 && near(newerRow.current)) messages.newer();
		};
		const scrolled = () => { const delta = element.scrollTop - lastScroll.current; lastScroll.current = element.scrollTop; if (delta) page(delta); };
		const wheel = (event: WheelEvent) => { if (event.deltaY) page(event.deltaY); };
		element.addEventListener("scroll", scrolled, { passive: true }); element.addEventListener("wheel", wheel, { passive: true });
		return () => { element.removeEventListener("scroll", scrolled); element.removeEventListener("wheel", wheel); };
	}, [messages.page, messages.loading]);
	useEffect(() => {
		if (!content.current) return;
		const observer = new ResizeObserver(() => { if (following.current && !anchor.current && host.current) host.current.scrollTop = host.current.scrollHeight; });
		observer.observe(content.current);
		return () => observer.disconnect();
	}, []);

	return <div className={cn("relative min-h-0 flex-1", className)}>
		<ScrollArea className="h-full" viewportRef={host} viewportProps={{ onScroll: update, "aria-live": "polite" }}>
			<div ref={content} className={cn("mx-auto flex w-full flex-col gap-7 py-6", compact ? "px-4" : "max-w-[760px] px-6")}>
				{messages.page.earlier > 0 && <button ref={earlierRow} type="button" disabled={messages.loading} onClick={messages.older} className="flex items-center gap-1.5 self-center px-3 py-1 text-xs text-muted-foreground hover:text-foreground">{messages.loading ? <><LoaderCircle className="size-3.5 animate-spin" />Loading earlier messages…</> : `Load ${messages.page.earlier} earlier messages`}</button>}
				{messages.error && <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{messages.error}<button type="button" className="ml-auto font-semibold underline" onClick={() => messages.retry()}>Retry</button></div>}
				{messages.loading && !messages.page.entries.length && <p className="text-center text-xs text-muted-foreground">Loading messages…</p>}
				{turns.map((turn, index) => <Turn key={turn.id} user={turn.user} entries={turn.entries} usageActivities={(turn.user && usageByTurn.get(turn.user.id)) || noActivities} task={view} onAttachment={attach} onBranch={branchFrom} compact={compact}
					onRewind={onRewind ? rewindTo : undefined} onRegenerate={onRegenerate && index === turns.length - 1 && !messages.page.later ? regenerate : undefined}
					live={running && (turn.user?.id === activeTurn || (!turn.user && index === turns.length - 1 && !messages.page.later))}
					complete={Boolean(turn.user?.completedAt) || index < turns.length - 1 || (!messages.page.later && !running)} />)}
				{messages.page.later > 0 && <button ref={newerRow} type="button" disabled={messages.loading} onClick={messages.newer} className="flex items-center gap-1.5 self-center px-3 py-1 text-xs text-muted-foreground hover:text-foreground">{messages.loading ? <><LoaderCircle className="size-3.5 animate-spin" />Loading newer messages…</> : "Load newer messages"}</button>}
				{children}
			</div>
		</ScrollArea>
		{!compact && <MessageNavigationRail turns={railTurns} viewport={host} onNavigate={() => { following.current = false; }} />}
		{/* A window that stops short of the newest entries always offers the way back, even if the reader never scrolled. */}
		{(showLatest || messages.page.later > 0) && <button type="button" onClick={() => { following.current = true; messages.latest(); if (host.current) host.current.scrollTop = host.current.scrollHeight; setShowLatest(false); }}
			className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-popover px-3 py-1.5 text-xs font-medium shadow-md hover:bg-muted"><ArrowDown className="size-3.5" />Jump to latest</button>}
	</div>;
}
