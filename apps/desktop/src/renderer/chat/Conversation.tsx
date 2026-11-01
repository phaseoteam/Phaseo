import { createContext, memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, Plane, Brain, Check, ChevronRight, Circle, CircleDot, CornerDownRight, CircleSlash, Copy, FilePen, FileText, FolderSearch, GitBranch, GitPullRequestArrow, Layers, ListChecks, LoaderCircle, PenLine, RotateCcw, Search, Sparkles, SquareTerminal, Wrench, X } from "lucide-react";
import { ScrollArea } from "../components/ui/scroll-area";
import { MessageNavigationRail, type RailTurn } from "./MessageNavigationRail";
import type { AgentActivity, Message, Task } from "../../shared/workspace";
import { useConversationPage } from "../lib/useConversationPage";
import type { ConversationPage } from "../../shared/conversationPage";
import { conversationTurns, firstUnread, turnDuration, userBursts, type Burst, type TurnEntry } from "../lib/conversationTurns";
import { elapsedLabel, useNow } from "../lib/elapsed";
import { contextShare, turnUsage } from "../lib/turnUsage";
import { formatRoundedCount } from "@phaseo/app-kit/format";
import { fullMessageTime, messageTime } from "../lib/messageTime";
import { formatCost } from "../../shared/usageAmounts";
import { cn } from "../lib/utils";
import { MessageContent } from "../components/MessageContent";
import { HtmlRenderFrame } from "../components/HtmlRenderFrame";
import { ModelLogo } from "../components/ModelLogo";
import { useTextCopy } from "../components/useTextCopy";
import { mentionPlainText } from "../lib/mentions";
import { harnessNames, knownModel, modelLabel } from "./ModelPicker";
import { ModelInfoCard } from "./ModelInfoCard";
import { AgentResult } from "./AgentThreads";
import { ProposedPlan } from "./ProposedPlan";
import { QuoteToolbar } from "./QuoteToolbar";
import { TurnChanges } from "./TurnChanges";
import { MessageFold } from "./MessageFold";
import { attachmentsOnlyText, MessageAttachments } from "./MessageAttachments";
import { ConversationAnnouncer } from "./ConversationAnnouncer";
import { ChatFindBar, clearPendingFind, FindTargetContext, useFindTarget, usePendingFind } from "./ChatFind";
import { useCommand } from "../lib/keybindings";
import { useOptionalWorkspace } from "../app/workspace";
import { DiffView } from "../components/DiffView";
import { openTurnDiff } from "../panels/events";
import { toolCallEdits } from "./toolCallDiff";

const planOutcomes = { implemented: "Implemented", revised: "Revision requested", declined: "Not implemented" } as const;

const toolLabels: Record<string, string> = { run_command: "Ran", start_background_command: "Started", read_background_output: "Read output", stop_background_command: "Stopped", list_background_commands: "Listed commands", read_file: "Read", view_image: "Viewed", edit_file: "Edited", fileChange: "Edited", write_file: "Wrote", delete_file: "Deleted", list_files: "Listed", search_files: "Searched", find_files: "Found files", propose_plan: "Proposed plan", load_tools: "Loaded tools", load_skill: "Loaded skill", ask_user: "Asked" };
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

function UserMessage({ message, taskId, projectId, onAttachment, onBranch, onRewind, canBranch, burst, compact }: { message: Message; taskId: string; projectId?: string; onAttachment: (id: string) => void; onBranch: (id: string) => void; onRewind?: (message: Message) => void; canBranch: boolean; burst?: Burst; compact?: boolean }) {
	const attachments = message.attachments ?? [];
	// Attachments sent without words stand on their own, without the text the app sent the agent in their place.
	const bubble = !attachments.length || message.text.trim() !== attachmentsOnlyText;
	// Inside a burst the actions sit beside the bubble, so the messages can stack tight; a narrow pane keeps them below.
	const beside = Boolean(burst?.next && bubble && !compact);
	const actions = <div data-find-ignore className={cn("flex items-center opacity-0 transition-opacity group-focus-within/message:opacity-100 group-hover/message:opacity-100", beside && "absolute top-1/2 right-full mr-2 -translate-y-1/2 whitespace-nowrap")}>
		<time dateTime={message.createdAt} title={fullMessageTime(message.createdAt)} className="mr-1 text-[11px] text-muted-foreground">{messageTime(message.createdAt)}</time>
		<CopyButton text={mentionPlainText(message.text)} />
		{onRewind && <ActionButton label="Edit from here" disabled={!canBranch} onClick={() => onRewind(message)}><PenLine /></ActionButton>}
		<ActionButton label="Branch from here" disabled={!canBranch} onClick={() => onBranch(message.id)}><GitBranch /></ActionButton>
	</div>;
	return <div data-conversation-id={`message:${message.id}`} className="group/message flex flex-col items-end gap-1">
		<h3 className="sr-only">You said</h3>
		{message.autopilot && <span title="Autopilot sent this to keep the task going" className="flex items-center gap-1 text-[11px] font-medium text-warning"><Plane className="size-3" />Autopilot</span>}
		{message.delivery === "steer" && !burst?.continuesSteer && <span title="Sent into the running turn" className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground"><CornerDownRight className="size-3" />Steer</span>}
		<MessageAttachments taskId={taskId} attachments={attachments} onPreview={onAttachment} />
		{bubble && <div data-selectable className={cn("message-user relative max-w-[85%] min-w-0 rounded-2xl rounded-br-md bg-muted px-4 py-2.5 text-[14px] leading-relaxed", burst?.previous && "rounded-tr-md")}><MessageFold id={message.id} text={message.text}><MessageContent text={message.text} projectId={projectId} lineBreaks /></MessageFold>{beside && actions}</div>}
		{!beside && actions}
	</div>;
}

const noticeTones = { failed: "text-destructive", completed: "text-emerald-600 dark:text-emerald-300/90", updated: "text-muted-foreground" } as const;
/** A wake the app sent the agent (T3 shows these as a notification row): the one-line summary, with the full update on demand. */
function WatchNotice({ message }: { message: Message }) {
	const [open, setOpen] = useState(false), notice = message.notice!;
	return <div data-conversation-id={`message:${message.id}`} data-notice={notice.kind} className="text-[12.5px]">
		<button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="group/notice flex w-full min-w-0 items-center gap-2 rounded-md py-1 text-left text-muted-foreground hover:text-foreground">
			{notice.kind === "issue" ? <CircleDot aria-hidden className={cn("size-3.5 shrink-0", noticeTones[notice.outcome])} /> : <GitPullRequestArrow aria-hidden className={cn("size-3.5 shrink-0", noticeTones[notice.outcome])} />}
			<span className="min-w-0 truncate font-medium text-foreground/85">{notice.kind === "issue" ? notice.summary : `Pull request ${notice.summary}`}</span>
			<time dateTime={message.createdAt} title={fullMessageTime(message.createdAt)} className="shrink-0 text-[11px]">{messageTime(message.createdAt)}</time>
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

/** Time since a start, counting each second; nothing when the start is unknown. */
function Elapsed({ since, className }: { since?: string; className?: string }) {
	const start = since ? Date.parse(since) : NaN, now = useNow(Number.isFinite(start));
	if (!Number.isFinite(start)) return null;
	return <span className={cn("shrink-0 text-muted-foreground tabular-nums", className)}>{elapsedLabel(now - start)}</span>;
}

/** The chat's project folder, so a tool call's absolute paths can be matched to the project's files. */
const ProjectDirectoryContext = createContext<string | undefined>(undefined);

/** `openDiff` opens the turn's diff at a file, once the turn has finished in a project that keeps snapshots. */
function ActivityRow({ activity, live, openDiff }: { activity: AgentActivity; live: boolean; openDiff?: (path: string) => void }) {
	const [open, setOpen] = useState(false);
	const directory = useContext(ProjectDirectoryContext);
	const edits = useMemo(() => toolCallEdits(activity, directory), [activity, directory]);
	if (activity.type === "usage") return null;
	if (activity.type === "plan" && activity.steps?.length) return <PlanSteps activity={activity} />;
	const reasoning = activity.type === "reasoning";
	const running = activity.status === "running" || (reasoning && live);
	const Icon = reasoning ? Brain : activity.type === "compaction" ? Layers : activity.type === "plan" ? ListChecks : toolIcon(activity.title);
	const label = reasoning ? (running ? "Thinking" : "Thought") : activity.type === "compaction" ? (running ? "Compacting context" : "Compacted context") : toolLabels[activity.title] ?? activity.title.replaceAll("_", " ");
	const summary = reasoning ? "" : activity.text.split("\n")[0];
	const expandable = !!activity.text && (reasoning || activity.text.length > summary.length || activity.text.length > 80);
	// An edit shows the file it changed and opens the turn's diff there; a recorded patch (Codex) shows as a diff, not JSON.
	const files = edits?.files ?? [], file = files[0];
	return <div className="group/edit text-[12.5px]">
		<div className="flex min-w-0 items-center">
			<button type="button" disabled={!expandable} onClick={() => setOpen(value => !value)} aria-expanded={open} className="group/activity flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-left text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground">
				{running ? <LoaderCircle className="size-3.5 shrink-0 animate-spin text-primary" /> : <Icon className={cn("size-3.5 shrink-0 text-muted-foreground", activity.status === "failed" && "text-destructive")} />}
				<span className={cn("shrink-0 font-medium text-foreground/85", running && "animate-pulse")}>{label}</span>
				{file && !summary.includes(file) ? <span className="min-w-0 truncate font-mono text-[11.5px] text-muted-foreground">{files.length > 1 ? `${file} and ${files.length - 1} more` : file}</span>
					: summary && <span className="min-w-0 truncate font-mono text-[11.5px] text-muted-foreground">{summary}</span>}
				{running && !reasoning && <Elapsed since={activity.startedAt} className="text-[11.5px]" />}
				{activity.status === "failed" && <X className="size-3.5 shrink-0 text-destructive" />}
				{expandable && <ChevronRight className={cn("size-3.5 shrink-0 opacity-0 transition group-hover/activity:opacity-100", open && "rotate-90 opacity-100")} />}
			</button>
			{file && openDiff && <button type="button" onClick={() => openDiff(file)} title={`Open ${file} in the turn's diff`} className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium text-muted-foreground opacity-0 group-hover/edit:opacity-100 focus-visible:opacity-100 hover:bg-muted hover:text-foreground">Open diff</button>}
		</div>
		{open && edits?.patch ? <ScrollArea className="mt-0.5 mb-2 ml-[15px] max-h-96 border-l border-border pl-2" viewportClassName="max-h-96"><DiffView patch={edits.patch} layout="unified" hideActions /></ScrollArea>
			: open && <ScrollArea className="mt-0.5 mb-2 ml-[15px] max-h-72 border-l border-border" viewportClassName="max-h-72"><div data-selectable className={cn("py-0.5 pl-4", reasoning ? "text-[13px] text-muted-foreground" : "font-mono text-[11.5px] whitespace-pre-wrap")}>{reasoning ? <MessageContent text={activity.text} /> : activity.text}</div></ScrollArea>}
	</div>;
}

function WorkLog({ entries, user, live, complete, task }: { entries: TurnEntry[]; user?: Message; live: boolean; complete: boolean; task: Task }) {
	const [opened, setOpen] = useState(live);
	const openDiff = user?.checkpoint?.after && !live && task.mode !== "chat" && task.projectId ? (path: string) => openTurnDiff({ taskId: task.id, messageId: user.id, path }) : undefined;
	useEffect(() => { setOpen(live); }, [live]);
	const steps = entries.filter(entry => entry.kind === "activity" ? entry.value.type !== "usage" : true);
	// Find in chat opens the log around its match.
	const found = useFindTarget(steps.map(entry => entry.value.id)), open = opened || found;
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
				{live && <Elapsed since={user?.startedAt} />}
				{tools > 0 && <span>· {tools} {tools === 1 ? "step" : "steps"}</span>}
			</button>
			{open && <div className="mt-1 ml-[7px] flex flex-col gap-0.5 border-l border-border pl-1.5">{steps.map(entry => entry.kind === "activity"
				? <ActivityRow key={entry.value.id} activity={entry.value} live={live} openDiff={openDiff} />
				: <div key={entry.value.id} data-conversation-id={`message:${entry.value.id}`} data-selectable data-quote className="px-2 py-1 text-[13px] text-foreground/85"><MessageContent text={entry.value.text} projectId={task.projectId} repairLocalLinks /></div>)}</div>}
		</div>
		{!open && plan?.kind === "activity" && <PlanSteps activity={plan.value} />}
	</div>;
}

function AssistantHeader({ task }: { task: Task }) {
	const model = knownModel(task.model);
	return <div role="heading" aria-level={3} className="flex items-center gap-2 text-[13px] font-semibold">
		<span className="flex size-5 items-center justify-center [&_img]:size-4.5 [&_.harness-logo]:size-4.5"><ModelLogo model={model ?? { id: task.model, name: task.model }} harness={task.harness} /></span>
		<ModelInfoCard harness={task.harness} model={task.model}>{task.model === "default" ? harnessNames[task.harness] : model?.name ?? modelLabel(task.model)}</ModelInfoCard>
		<span className="font-medium text-muted-foreground">{task.harness === "phaseo" ? "via Phaseo" : `in ${harnessNames[task.harness]}`}</span>
	</div>;
}

const noActivities: AgentActivity[] = [];
function UnreadDivider() {
	return <div role="separator" aria-label="New since your last visit" className="flex items-center gap-3 text-[11px] font-medium text-primary"><span aria-hidden className="h-px flex-1 bg-primary/40" />New since your last visit<span aria-hidden className="h-px flex-1 bg-primary/40" /></div>;
}
type TurnProps = { user?: Message; entries: TurnEntry[]; usageActivities: AgentActivity[]; live: boolean; complete: boolean; task: Task; onAttachment: (id: string) => void; onBranch: (id: string) => void; onRewind?: (message: Message) => void; /** Offers Regenerate on this turn's answer (the last turn of a Chat-mode chat). */ onRegenerate?: (message: Message) => void; compact?: boolean; burst?: Burst; /** Where this turn's "New since your last visit" line goes, if it has it. */ unread?: "start" | "answer" };
const sameItems = <T,>(a: readonly T[], b: readonly T[], value: (item: T) => unknown = item => item) => a.length === b.length && a.every((item, index) => value(item) === value(b[index]));
/**
 * A turn re-renders only when its own entries or the chat fields it shows change, so loading a page of older turns
 * renders those turns alone. The callbacks are stable (see Conversation).
 */
const Turn = memo(function Turn({ user, entries, usageActivities, live, complete, task, onAttachment, onBranch, onRewind, onRegenerate, compact, burst, unread }: TurnProps) {
	// Text after the last step is the answer, even while it is still streaming.
	const latest = entries.findLast(entry => !(entry.kind === "activity" && entry.value.type === "usage"));
	const isAnswer = (entry?: TurnEntry) => entry?.kind === "message" && entry.value.role === "assistant" && entry.value.delivery !== "subagent";
	const final = isAnswer(latest) ? latest : complete && !live ? entries.findLast(entry => entry.kind === "message" && entry.value.role === "assistant") : undefined;
	// Proposed plans stand on their own in the turn, as T3 Code's plan card does, rather than inside the work log.
	const plans = entries.flatMap(entry => entry.kind === "activity" && entry.value.proposed ? [entry.value] : []);
	// Pages an agent showed with html_render stand above the reply, like plans.
	const pages = entries.flatMap(entry => entry.kind === "activity" && entry.value.htmlRender ? [{ id: entry.value.id, html: entry.value.text, render: entry.value.htmlRender }] : []);
	const work = entries.filter(entry => entry !== final && !(entry.kind === "message" && entry.value.delivery === "subagent") && !(entry.kind === "activity" && (entry.value.proposed || entry.value.htmlRender)));
	const delegated = entries.filter(entry => entry.kind === "message" && entry.value.delivery === "subagent");
	// The timeline omits usage reports, so read them from the turn's activities.
	const usage = turnUsage(usageActivities), context = contextShare(usageActivities);
	const canBranch = !["running", "waiting"].includes(task.status) && !task.archived;
	const hasAssistant = work.length > 0 || plans.length > 0 || !!final || live;
	return <div data-turn-id={user && user.delivery !== "subagent" && !user.notice ? user.id : undefined} className={cn("flex flex-col gap-4", burst?.next && "-mb-6")}>
		{unread === "start" && <UnreadDivider />}
		{user && (user.notice ? <WatchNotice message={user} /> : user.delivery === "subagent" ? <AgentResult message={user} projectId={task.projectId} /> : <UserMessage message={user} taskId={task.id} projectId={task.projectId} onAttachment={onAttachment} onBranch={onBranch} onRewind={onRewind} canBranch={canBranch} burst={burst} compact={compact} />)}
		{unread === "answer" && hasAssistant && <UnreadDivider />}
		{hasAssistant && <div data-conversation-id={`turn:${user?.id ?? entries[0]?.value.id}`} className="group/turn flex flex-col gap-3">
			{/* Messages are headings, so a screen reader's heading keys move between them. */}
			{compact ? <h3 className="sr-only">{task.model === "default" ? harnessNames[task.harness] : modelLabel(task.model)} replied</h3> : <AssistantHeader task={task} />}
			<WorkLog entries={work} user={user} live={live} complete={complete} task={task} />
			{plans.map(plan => <ProposedPlan key={plan.id} markdown={plan.text} projectId={task.projectId} status={plan.proposed?.outcome ? planOutcomes[plan.proposed.outcome] : undefined}>
				{plan.proposed?.feedback && <p data-selectable className="mt-2 border-l-2 border-border pl-3 text-[13px] whitespace-pre-wrap text-muted-foreground">{plan.proposed.feedback}</p>}
			</ProposedPlan>)}
			{pages.map(page => <HtmlRenderFrame key={page.id} html={page.html} render={page.render} />)}
			{live && !final && !work.some(entry => entry.kind === "message" || entry.value.type !== "usage") && <div className="flex items-center gap-1.5 py-1 text-[13px] text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin text-primary" /><span className="animate-pulse font-medium">Working</span><Elapsed since={user?.startedAt} /></div>}
			{delegated.map(entry => <details key={entry.value.id} className="rounded-xl border border-border px-3 py-2 text-[13px]"><summary className="cursor-pointer font-medium text-muted-foreground">Agent result</summary><MessageContent text={entry.value.text} projectId={task.projectId} /></details>)}
			{final?.kind === "message" && <div data-selectable data-quote data-conversation-id={`message:${final.value.id}`} className="text-[14px] leading-relaxed"><MessageContent text={final.value.text} projectId={task.projectId} repairLocalLinks /></div>}
			{final?.kind === "message" && !live && <div className="-ml-1.5 flex items-center gap-0.5 opacity-60 transition-opacity group-hover/turn:opacity-100">
				<CopyButton text={final.value.text} />
				{onRegenerate && user && <ActionButton label="Regenerate" disabled={!canBranch} onClick={() => onRegenerate(user)}><RotateCcw /></ActionButton>}
				<ActionButton label="Branch from this answer" disabled={!canBranch} onClick={() => onBranch(final.value.id)}><GitBranch /></ActionButton>
				<time dateTime={user?.completedAt ?? final.value.createdAt} title={fullMessageTime(user?.completedAt ?? final.value.createdAt)} className="ml-1 text-[11px] text-muted-foreground">{messageTime(user?.completedAt ?? final.value.createdAt)}</time>
				{usage.Total !== undefined && <span className="ml-2 font-mono text-[11px] text-muted-foreground">{formatRoundedCount(usage.Total, "en-US")} tokens</span>}
				{usage.Cost !== undefined && usage.Cost > 0 && <span title="What this answer cost, as the Phaseo gateway priced it." className="font-mono text-[11px] text-muted-foreground">· {formatCost(usage.Cost)}</span>}
				{context !== undefined && <span title="How much of the model's context window the conversation used at the end of this turn. Phaseo compacts it automatically when it nears the limit." className={cn("font-mono text-[11px]", context >= 0.8 ? "text-warning" : "text-muted-foreground")}>· {Math.round(context * 100)}% of context</span>}
			</div>}
		</div>}
		{/* Code turns that changed files say so under the answer, with the way into the Diff pane. */}
		{user && !live && complete && task.mode !== "chat" && task.projectId && user.checkpoint?.after && <TurnChanges taskId={task.id} projectId={task.projectId} message={user} />}
	</div>;
}, (a, b) => a.user === b.user && a.live === b.live && a.complete === b.complete && a.compact === b.compact
	&& a.unread === b.unread && a.burst?.previous === b.burst?.previous && a.burst?.next === b.burst?.next && a.burst?.continuesSteer === b.burst?.continuesSteer && a.onRewind === b.onRewind && a.onRegenerate === b.onRegenerate
	&& sameItems(a.entries, b.entries, entry => entry.value) && sameItems(a.usageActivities, b.usageActivities)
	&& a.task.id === b.task.id && a.task.status === b.task.status && a.task.archived === b.task.archived && a.task.projectId === b.task.projectId && a.task.model === b.task.model && a.task.harness === b.task.harness && a.task.mode === b.task.mode);

/** Where each chat was left this session: the message at the top of the view and how far below the top it sat. */
const scrollPositions = new Map<string, { id: string; offset: number }>();

/** `unreadSince` is when you last looked at the chat before opening it, for the "New since your last visit" line. */
export function Conversation({ task, onAttachment, onBranch, onRewind, onRegenerate, children, compact, className, unreadSince }: { task: Task; onAttachment: (id: string) => void; onBranch: (id: string) => void; onRewind?: (message: Message) => void; onRegenerate?: (message: Message) => void; children?: ReactNode; compact?: boolean; className?: string; unreadSince?: string }) {
	const host = useRef<HTMLDivElement>(null);
	const content = useRef<HTMLDivElement>(null);
	const following = useRef(true);
	// `waiting` keeps a restored position until a page other than this one (the one holding its message) arrives.
	const anchor = useRef<{ id?: string; top: number; scroll: number; waiting?: ConversationPage } | undefined>(undefined);
	const [showLatest, setShowLatest] = useState(false);
	// Find in chat (Mod+F), or a find the palette's message search asked for; `key` restarts the bar for a new request.
	const [find, setFind] = useState<{ key: number; focus: number; initial?: { query: string; messageId?: string } }>();
	const [findTarget, setFindTarget] = useState<string>();
	const pendingFind = usePendingFind(task.id);
	useEffect(() => { if (!pendingFind || compact) return; clearPendingFind(); setFind(current => ({ key: (current?.key ?? 0) + 1, focus: (current?.focus ?? 0) + 1, initial: { query: pendingFind.query, messageId: pendingFind.messageId } })); }, [pendingFind, compact]);
	useCommand("chat.find", () => setFind(current => ({ key: current?.key ?? 0, focus: (current?.focus ?? 0) + 1, initial: current?.initial })), !compact);
	// Message pages carry their turns' activities, so steps arrive with the messages they belong to.
	const messages = useConversationPage(task, "messages", following, remember);
	const activityEntries = useMemo(() => messages.page.activities ?? [], [messages.page.activities]);
	const turns = useMemo(() => conversationTurns(messages.page.entries as Message[], activityEntries), [messages.page.entries, activityEntries]);
	const bursts = useMemo(() => userBursts(turns), [turns]);
	const directory = useOptionalWorkspace()?.overview.projects.find(project => project.id === task.projectId)?.directory;
	const unread = useMemo(() => firstUnread(turns, unreadSince), [turns, unreadSince]);
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
		if (!element || anchor.current?.waiting) return;
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
	// A chat opens where it was left, unless it was left at the latest message.
	useLayoutEffect(() => {
		const element = host.current, saved = compact ? undefined : scrollPositions.get(task.id);
		if (element && saved) {
			following.current = false;
			const top = element.getBoundingClientRect().top + saved.offset;
			const loaded = Boolean(element.querySelector(`[data-conversation-id="${CSS.escape(saved.id)}"]`)) || !saved.id.startsWith("message:");
			if (!loaded) messages.jumpTo(saved.id.slice("message:".length));
			anchor.current = { id: saved.id, top, scroll: 0, ...(loaded ? {} : { waiting: messages.page }) };
		}
		return () => {
			if (!element || compact) return;
			if (following.current) { scrollPositions.delete(task.id); return; }
			const view = element.getBoundingClientRect().top;
			const entry = Array.from(element.querySelectorAll<HTMLElement>('[data-conversation-id^="message:"]')).find(value => value.getBoundingClientRect().bottom >= view);
			if (entry?.dataset.conversationId) scrollPositions.set(task.id, { id: entry.dataset.conversationId, offset: entry.getBoundingClientRect().top - view });
		};
	}, []);
	useLayoutEffect(() => {
		const element = host.current;
		if (!element) return;
		if (anchor.current) {
			const saved = anchor.current;
			const entry = saved.id ? element.querySelector<HTMLElement>(`[data-conversation-id="${CSS.escape(saved.id)}"]`) : null;
			if (!entry && saved.waiting) {
				if (saved.waiting === messages.page && !messages.error) return;
				// The message is gone (a rewind, say): open at the latest instead.
				anchor.current = undefined; following.current = true; messages.latest(); element.scrollTop = element.scrollHeight; lastScroll.current = element.scrollTop;
				return;
			}
			element.scrollTop = entry ? element.scrollTop + entry.getBoundingClientRect().top - saved.top : saved.scroll;
			anchor.current = undefined;
		} else if (following.current) element.scrollTop = element.scrollHeight;
		// Programmatic scrolling is not the reader's: it must not page further.
		lastScroll.current = element.scrollTop;
	}, [task, messages.page, messages.error]);
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
		<ProjectDirectoryContext value={directory}><FindTargetContext value={findTarget}><ScrollArea className="h-full" viewportRef={host} viewportProps={{ onScroll: update, ...{ "data-conversation-viewport": "" }, ...compact ? {} : { "data-focus-region": "", tabIndex: -1 } }}>
			<div ref={content} className={cn("mx-auto flex w-full flex-col gap-7 py-6", compact ? "px-4" : "max-w-[760px] px-6")}>
				{messages.page.earlier > 0 && <button ref={earlierRow} type="button" disabled={messages.loading} onClick={messages.older} className="flex items-center gap-1.5 self-center px-3 py-1 text-xs text-muted-foreground hover:text-foreground">{messages.loading ? <><LoaderCircle className="size-3.5 animate-spin" />Loading earlier messages…</> : `Load ${messages.page.earlier} earlier messages`}</button>}
				{messages.error && <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{messages.error}<button type="button" className="ml-auto font-semibold underline" onClick={() => messages.retry()}>Retry</button></div>}
				{messages.loading && !messages.page.entries.length && <p className="text-center text-xs text-muted-foreground">Loading messages…</p>}
				{turns.map((turn, index) => <Turn key={turn.id} user={turn.user} entries={turn.entries} usageActivities={(turn.user && usageByTurn.get(turn.user.id)) || noActivities} task={view} onAttachment={attach} onBranch={branchFrom} compact={compact} burst={bursts[index]} unread={unread?.turnId === turn.id ? unread.at : undefined}
					onRewind={onRewind ? rewindTo : undefined} onRegenerate={onRegenerate && index === turns.length - 1 && !messages.page.later ? regenerate : undefined}
					live={running && (turn.user?.id === activeTurn || (!turn.user && index === turns.length - 1 && !messages.page.later))}
					complete={Boolean(turn.user?.completedAt) || index < turns.length - 1 || (!messages.page.later && !running)} />)}
				{messages.page.later > 0 && <button ref={newerRow} type="button" disabled={messages.loading} onClick={messages.newer} className="flex items-center gap-1.5 self-center px-3 py-1 text-xs text-muted-foreground hover:text-foreground">{messages.loading ? <><LoaderCircle className="size-3.5 animate-spin" />Loading newer messages…</> : "Load newer messages"}</button>}
				{children}
			</div>
		</ScrollArea></FindTargetContext></ProjectDirectoryContext>
		{find && <ChatFindBar key={find.key} taskId={task.id} revision={task.revision ?? 0} host={host} page={messages.page} target={findTarget} onTarget={setFindTarget} initial={find.initial} focusSignal={find.focus} onClose={() => setFind(undefined)}
			loaded={id => messages.page.entries.some(entry => entry.id === id)} jump={(id, turnId) => messages.jumpTo(turnId ?? id)}
			onScrolled={() => { following.current = false; if (host.current) lastScroll.current = host.current.scrollTop; }} />}
		<ConversationAnnouncer task={task} />
		{!compact && <MessageNavigationRail turns={railTurns} viewport={host} onNavigate={() => { following.current = false; }} />}
		<QuoteToolbar root={content} />
		{/* A window that stops short of the newest entries always offers the way back, even if the reader never scrolled. */}
		{(showLatest || messages.page.later > 0) && <button type="button" onClick={() => { following.current = true; messages.latest(); if (host.current) host.current.scrollTop = host.current.scrollHeight; setShowLatest(false); }}
			className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-popover px-3 py-1.5 text-xs font-medium shadow-md hover:bg-muted"><ArrowDown className="size-3.5" />Jump to latest</button>}
	</div>;
}
