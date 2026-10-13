import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, Brain, Check, ChevronRight, Circle, CircleDot, CircleSlash, Copy, FilePen, FileText, FolderSearch, GitBranch, Layers, ListChecks, LoaderCircle, Paperclip, Search, Sparkles, SquareTerminal, Wrench, X } from "lucide-react";
import type { AgentActivity, Message, Task } from "../../shared/workspace";
import { useConversationPage } from "../lib/useConversationPage";
import { conversationTurns, turnDuration, type TurnEntry } from "../lib/conversationTurns";
import { turnUsage } from "../lib/turnUsage";
import { cn } from "../lib/utils";
import { MessageContent } from "../components/MessageContent";
import { ModelLogo } from "../components/ModelLogo";
import { useTextCopy } from "../components/useTextCopy";
import { harnessNames, knownModel, modelLabel } from "./ModelPicker";

const toolLabels: Record<string, string> = { run_project_command: "Ran", read_project_file: "Read", write_project_file: "Edited", list_project_files: "Listed", load_skill: "Loaded skill", ask_user: "Asked" };
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

function UserMessage({ message, onAttachment, onBranch, canBranch }: { message: Message; onAttachment: (id: string) => void; onBranch: (id: string) => void; canBranch: boolean }) {
	return <div data-conversation-id={`message:${message.id}`} className="group/message flex flex-col items-end gap-1">
		<div data-selectable className="max-w-[85%] rounded-2xl rounded-br-md bg-muted px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap">{message.text}
			{!!message.attachments?.length && <div className="mt-2 flex flex-wrap gap-1.5">{message.attachments.map(attachment => <button key={attachment.id} type="button" onClick={() => onAttachment(attachment.id)} className="inline-flex h-6 items-center gap-1 rounded-md bg-background/70 px-2 text-xs hover:bg-background"><Paperclip className="size-3" />{attachment.name}</button>)}</div>}
		</div>
		<div className="flex items-center opacity-0 transition-opacity group-hover/message:opacity-100">
			<span className="mr-1 text-[11px] text-muted-foreground">{new Date(message.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
			<CopyButton text={message.text} />
			<ActionButton label="Branch from here" disabled={!canBranch} onClick={() => onBranch(message.id)}><GitBranch /></ActionButton>
		</div>
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
		{open && <div data-selectable className={cn("mt-0.5 mb-2 ml-[15px] max-h-72 overflow-auto border-l border-border py-0.5 pl-4", reasoning ? "text-[13px] text-muted-foreground" : "font-mono text-[11.5px] whitespace-pre-wrap")}>{reasoning ? <MessageContent text={activity.text} /> : activity.text}</div>}
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
		{task.model === "default" ? harnessNames[task.harness] : model?.name ?? modelLabel(task.model)}
		<span className="font-medium text-muted-foreground">{task.harness === "phaseo" ? "via Phaseo" : `in ${harnessNames[task.harness]}`}</span>
	</div>;
}

function Turn({ user, entries, live, complete, task, onAttachment, onBranch, compact }: { user?: Message; entries: TurnEntry[]; live: boolean; complete: boolean; task: Task; onAttachment: (id: string) => void; onBranch: (id: string) => void; compact?: boolean }) {
	// Text after the last step is the answer, even while it is still streaming.
	const latest = entries.findLast(entry => !(entry.kind === "activity" && entry.value.type === "usage"));
	const isAnswer = (entry?: TurnEntry) => entry?.kind === "message" && entry.value.role === "assistant" && entry.value.delivery !== "subagent";
	const final = isAnswer(latest) ? latest : complete && !live ? entries.findLast(entry => entry.kind === "message" && entry.value.role === "assistant") : undefined;
	const work = entries.filter(entry => entry !== final && !(entry.kind === "message" && entry.value.delivery === "subagent"));
	const delegated = entries.filter(entry => entry.kind === "message" && entry.value.delivery === "subagent");
	// The timeline omits usage reports, so read them from the turn's activities.
	const usage = turnUsage(user ? task.activities?.filter(activity => activity.type === "usage" && activity.id.startsWith(`${user.id}:`)) ?? [] : []);
	const canBranch = !["running", "waiting"].includes(task.status) && !task.archived;
	const hasAssistant = work.length > 0 || !!final || live;
	return <div className="flex flex-col gap-4">
		{user && <UserMessage message={user} onAttachment={onAttachment} onBranch={onBranch} canBranch={canBranch} />}
		{hasAssistant && <div data-conversation-id={`turn:${user?.id ?? entries[0]?.value.id}`} className="group/turn flex flex-col gap-3">
			{!compact && <AssistantHeader task={task} />}
			<WorkLog entries={work} user={user} live={live} complete={complete} task={task} />
			{live && !final && !work.some(entry => entry.kind === "message" || entry.value.type !== "usage") && <div className="flex items-center gap-1.5 py-1 text-[13px] text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin text-primary" /><span className="animate-pulse font-medium">Working</span></div>}
			{delegated.map(entry => <details key={entry.value.id} className="rounded-xl border border-border px-3 py-2 text-[13px]"><summary className="cursor-pointer font-medium text-muted-foreground">Agent result</summary><MessageContent text={entry.value.text} projectId={task.projectId} /></details>)}
			{final?.kind === "message" && <div data-selectable data-conversation-id={`message:${final.value.id}`} className="text-[14px] leading-relaxed"><MessageContent text={final.value.text} projectId={task.projectId} repairLocalLinks /></div>}
			{final?.kind === "message" && !live && <div className="-ml-1.5 flex items-center gap-0.5 opacity-60 transition-opacity group-hover/turn:opacity-100">
				<CopyButton text={final.value.text} />
				<ActionButton label="Branch from this answer" disabled={!canBranch} onClick={() => onBranch(final.value.id)}><GitBranch /></ActionButton>
				{usage.Total !== undefined && <span className="ml-2 font-mono text-[11px] text-muted-foreground">{new Intl.NumberFormat(undefined, { notation: "compact" }).format(usage.Total)} tokens</span>}
			</div>}
		</div>}
	</div>;
}

export function Conversation({ task, onAttachment, onBranch, children, compact, className }: { task: Task; onAttachment: (id: string) => void; onBranch: (id: string) => void; children?: ReactNode; compact?: boolean; className?: string }) {
	const host = useRef<HTMLDivElement>(null);
	const content = useRef<HTMLDivElement>(null);
	const following = useRef(true);
	const anchor = useRef<{ id?: string; top: number; scroll: number } | undefined>(undefined);
	const [showLatest, setShowLatest] = useState(false);
	const messages = useConversationPage(task, "messages", following, remember);
	const activities = useConversationPage(task, "activities", following, remember);
	const turns = conversationTurns(messages.page.entries as Message[], activities.page.entries as AgentActivity[]);
	const activeTurn = task.messages.findLast(message => message.role === "user")?.id;
	const running = ["running", "waiting"].includes(task.status);
	const view = { ...task, messages: messages.page.entries as Message[], activities: activities.page.entries as AgentActivity[] };

	function remember() {
		const element = host.current;
		if (!element) return;
		following.current = false;
		const top = element.getBoundingClientRect().top;
		const entry = Array.from(element.querySelectorAll<HTMLElement>("[data-conversation-id]")).find(value => value.getBoundingClientRect().bottom >= top);
		anchor.current = { id: entry?.dataset.conversationId, top: entry?.getBoundingClientRect().top ?? top, scroll: element.scrollTop };
	}
	function update() {
		const element = host.current;
		if (!element) return;
		const latest = !messages.page.later && !activities.page.later && element.scrollHeight - element.clientHeight - element.scrollTop <= 64;
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
	}, [task, messages.page, activities.page]);
	useEffect(() => {
		if (!content.current) return;
		const observer = new ResizeObserver(() => { if (following.current && !anchor.current && host.current) host.current.scrollTop = host.current.scrollHeight; });
		observer.observe(content.current);
		return () => observer.disconnect();
	}, []);

	return <div className={cn("relative min-h-0 flex-1", className)}>
		<div ref={host} onScroll={update} className="scrollbar-thin h-full overflow-y-auto" aria-live="polite">
			<div ref={content} className={cn("mx-auto flex w-full flex-col gap-7 py-6", compact ? "px-4" : "max-w-[760px] px-6")}>
				{messages.page.earlier > 0 && <button type="button" disabled={messages.loading} onClick={messages.older} className="self-center rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted">Load {messages.page.earlier} earlier messages</button>}
				{activities.page.earlier > 0 && <button type="button" disabled={activities.loading} onClick={activities.older} className="self-center rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted">Load earlier activity</button>}
				{(messages.error || activities.error) && <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{messages.error || activities.error}<button type="button" className="ml-auto font-semibold underline" onClick={() => { messages.retry(); activities.retry(); }}>Retry</button></div>}
				{messages.loading && !messages.page.entries.length && <p className="text-center text-xs text-muted-foreground">Loading messages…</p>}
				{turns.map((turn, index) => <Turn key={turn.id} user={turn.user} entries={turn.entries} task={view} onAttachment={onAttachment} onBranch={onBranch} compact={compact}
					live={running && (turn.user?.id === activeTurn || (!turn.user && index === turns.length - 1 && !messages.page.later))}
					complete={Boolean(turn.user?.completedAt) || index < turns.length - 1 || (!messages.page.later && !activities.page.later && !running)} />)}
				{messages.page.later > 0 && <button type="button" disabled={messages.loading} onClick={messages.newer} className="self-center rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted">Load newer messages</button>}
				{children}
			</div>
		</div>
		{showLatest && <button type="button" onClick={() => { following.current = true; messages.latest(); activities.latest(); if (host.current) host.current.scrollTop = host.current.scrollHeight; setShowLatest(false); }}
			className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-popover px-3 py-1.5 text-xs font-medium shadow-md hover:bg-muted"><ArrowDown className="size-3.5" />Jump to latest</button>}
	</div>;
}
