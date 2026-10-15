import { useEffect, useMemo, useState, type ReactNode } from "react";
import { JumpHint, publishSidebarOrder, useJumpHints } from "../lib/sidebarOrder";
import { ContextMenu } from "@base-ui/react/context-menu";
import { AlarmClock, AlarmClockOff, Check, ChevronDown, CircleAlert, CircleCheck, CircleDashed, CircleDotDashed, Clock, FolderOpen, FolderPlus, GitBranch, MessageCircleQuestion, Pin, PinOff, Plus, ShieldQuestion, Undo2 } from "lucide-react";
import { hasWoken, isUnread, settleBlocker, shortDuration } from "../../shared/threadLifecycle";
import type { TaskOverview } from "../../shared/workspaceOverview";
import { errorText, useWorkspace } from "../app/workspace";
import { TagDots } from "../components/Tags";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { ModelStack } from "../chat/ModelPicker";
import { usePersistedState } from "../lib/persistedState";
import { cn } from "../lib/utils";
import { codeSections } from "./codeThreads";
import { CustomSnoozeDialog, DeleteChatDialog, RenameInput, SnoozeItems, ThreadMenuItems, useThreadActions } from "./threadActions";

/** Re-renders on an interval, for live "Working 12s" counters and snoozes that expire. */
function useNow(interval: number) {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => { const timer = setInterval(() => setNow(Date.now()), interval); return () => clearInterval(timer); }, [interval]);
	return now;
}

function elapsed(from: string | undefined, now: number) {
	const seconds = Math.max(0, Math.round((now - (from ? Date.parse(from) : now)) / 1000));
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m`;
	return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** T3's status slot: what needs the person first, then work in progress, then unread results, else when they last wrote. */
function StatusLabel({ task, now, onDismissWake }: { task: TaskOverview; now: number; onDismissWake: () => void }) {
	const label = (icon: ReactNode, text: ReactNode, className: string) => <span className={cn("flex shrink-0 items-center gap-1 text-[11px] font-medium", className)}>{icon}{text}</span>;
	if (task.approvalsCount) return label(<ShieldQuestion className="size-3.5" />, "Approval", "text-warning");
	if (task.answersCount) return label(<MessageCircleQuestion className="size-3.5" />, "Input", "text-indigo-600 dark:text-indigo-300");
	if (task.status === "running") return label(<CircleDashed className="size-3.5 animate-spin [animation-duration:3s]" />, <>Working <span className="tabular-nums">{elapsed(task.lastUserMessageAt, now)}</span></>, "text-sky-600 dark:text-sky-400");
	if (task.status === "waiting") return label(<CircleDotDashed className="size-3.5" />, "Waiting", "text-muted-foreground");
	if (task.status === "failed" || task.status === "interrupted") return label(<CircleAlert className="size-3.5" />, task.status === "failed" ? "Failed" : "Stopped", "text-destructive");
	if (task.status === "limited") return label(<CircleAlert className="size-3.5" />, "Limited", "text-warning");
	if (hasWoken(task, now)) return <button type="button" title="Dismiss" onClick={event => { event.stopPropagation(); onDismissWake(); }} className="flex shrink-0 items-center gap-1 rounded text-[11px] font-medium text-warning hover:underline"><AlarmClock className="size-3.5" />Woke</button>;
	if (isUnread(task)) return label(<CircleCheck className="size-3.5" />, "Done", "text-success");
	const at = task.lastUserMessageAt ?? task.createdAt;
	return <span className="shrink-0 text-[11px] text-muted-foreground">{shortDuration(now - Date.parse(at))}</span>;
}

/** A chat in the pinned or active list: project, title, then branch, tags and model. */
function CardRow({ task, now, scope, onScope, hint }: { task: TaskOverview; now: number; scope: string; onScope: (id: string) => void; hint?: number }) {
	const { overview, selectedId, select } = useWorkspace();
	const actions = useThreadActions();
	const [customSnooze, setCustomSnooze] = useState(false);
	const [renaming, setRenaming] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const project = overview.projects.find(value => value.id === task.projectId);
	const selected = task.id === selectedId;
	const quiet = (task.status === "running" || task.status === "waiting" || !isUnread(task)) && !task.approvalsCount && !task.answersCount && !hasWoken(task, now) && !["failed", "limited", "interrupted"].includes(task.status);
	const blocked = settleBlocker(task);
	return <ContextMenu.Root>
		<ContextMenu.Trigger render={<div role="button" tabIndex={0} aria-current={selected ? "page" : undefined} onClick={() => select(task.id)} onKeyDown={event => { if (event.key === "Enter") select(task.id); }} />}
			className={cn("group/row relative mx-2 flex h-[4.5rem] flex-col justify-center gap-0.5 rounded-md px-2.5 outline-none hover:bg-sidebar-accent/70 focus-visible:ring-2 focus-visible:ring-ring/40", selected && "bg-sidebar-accent")}>
			<div className="flex h-5 items-center gap-1.5 text-xs text-muted-foreground">
				<FolderOpen className="size-3.5 shrink-0" /><span className="min-w-0 truncate">{project?.name}</span>
				{task.pinned && <button type="button" aria-label="Unpin chat" title="Unpin chat" onClick={event => { event.stopPropagation(); void actions.pin(task); }} className="group/pin grid size-4 shrink-0 place-items-center rounded hover:text-foreground"><Pin className="size-3 group-hover/pin:hidden" /><PinOff className="hidden size-3 group-hover/pin:block" /></button>}
				<span className="ml-auto flex items-center group-hover/row:hidden group-focus-within/row:hidden">{hint !== undefined ? <JumpHint index={hint} /> : <StatusLabel task={task} now={now} onDismissWake={() => void actions.wake(task)} />}</span>
				<span className="ml-auto hidden items-center gap-0.5 group-hover/row:flex group-focus-within/row:flex" onClick={event => event.stopPropagation()}>
					<DropdownMenu>
						<DropdownMenuTrigger render={<button type="button" aria-label="Snooze chat" title="Snooze chat" className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-background/70 hover:text-foreground" />}><Clock className="size-3.5" /></DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-56"><SnoozeItems onSnooze={until => void actions.snooze(task, until, scope)} onCustom={() => setCustomSnooze(true)} /></DropdownMenuContent>
					</DropdownMenu>
					<button type="button" title={blocked ?? "Settle chat"} aria-label="Settle chat" disabled={Boolean(blocked)} onClick={() => void actions.settle(task, scope)}
						className="flex h-5 items-center gap-1 rounded px-1.5 text-[11px] font-medium text-muted-foreground hover:bg-background/70 hover:text-foreground disabled:opacity-40"><Check className="size-3.5" />Settle</button>
				</span>
			</div>
			{renaming ? <RenameInput task={task} onDone={() => setRenaming(false)} /> : <div className={cn("truncate text-[13px]", quiet ? "text-sidebar-foreground/80" : "font-medium text-sidebar-foreground")}>{task.title}</div>}
			<div className="flex h-4 items-center gap-1.5 text-[11px] text-muted-foreground/70">
				{project?.worktree && <span className="flex min-w-0 items-center gap-1 truncate font-mono"><GitBranch className="size-3 shrink-0" />{project.worktree.branch}</span>}
				<TagDots tags={task.tags} />
				<span className="ml-auto shrink-0"><ModelStack models={[task]} size="sm" ringClassName="ring-transparent" /></span>
			</div>
		</ContextMenu.Trigger>
		<DropdownMenuContent className="w-64"><ThreadMenuItems task={task} scope={scope} onScope={onScope} onRename={() => setRenaming(true)} onDelete={() => setDeleting(true)} onCustomSnooze={() => setCustomSnooze(true)} /></DropdownMenuContent>
		<CustomSnoozeDialog open={customSnooze} onOpenChange={setCustomSnooze} onSnooze={until => void actions.snooze(task, until, scope)} />
		<DeleteChatDialog task={task} scope={scope} open={deleting} onOpenChange={setDeleting} />
	</ContextMenu.Root>;
}

/** A snoozed or settled chat: just the title, and when it wakes or how long ago it settled. */
function SlimRow({ task, now, kind, scope, onScope }: { task: TaskOverview; now: number; kind: "snoozed" | "settled"; scope: string; onScope: (id: string) => void }) {
	const { selectedId, select } = useWorkspace();
	const actions = useThreadActions();
	const [customSnooze, setCustomSnooze] = useState(false);
	const [renaming, setRenaming] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const selected = task.id === selectedId;
	const when = kind === "snoozed" ? shortDuration(Date.parse(task.snoozedUntil!) - now) : shortDuration(now - Date.parse(task.settledAt ?? task.updatedAt));
	return <ContextMenu.Root>
		<ContextMenu.Trigger render={<div role="button" tabIndex={0} aria-current={selected ? "page" : undefined} onClick={() => select(task.id)} onKeyDown={event => { if (event.key === "Enter") select(task.id); }} />}
			className={cn("group/row mx-2 flex h-9 items-center gap-2 rounded-md px-2.5 text-[13px] outline-none hover:bg-sidebar-accent/70 focus-visible:ring-2 focus-visible:ring-ring/40", selected && "bg-sidebar-accent")}>
			<FolderOpen className="size-3.5 shrink-0 text-muted-foreground opacity-40 grayscale group-hover/row:opacity-100" />
			{renaming ? <RenameInput task={task} onDone={() => setRenaming(false)} /> : <span className="min-w-0 flex-1 truncate text-sidebar-foreground/70">{task.title}</span>}
			<span className={cn("shrink-0 text-[11px] group-hover/row:hidden", kind === "snoozed" ? "text-sky-600 dark:text-sky-400" : "text-muted-foreground")}>{when}</span>
			<button type="button" onClick={event => { event.stopPropagation(); void (kind === "snoozed" ? actions.wake(task) : actions.unsettle(task)); }} aria-label={kind === "snoozed" ? "Wake chat now" : "Un-settle chat"} title={kind === "snoozed" ? "Wake chat now" : "Un-settle chat"}
				className="hidden size-5 shrink-0 place-items-center rounded text-muted-foreground group-hover/row:grid hover:bg-background/70 hover:text-foreground">{kind === "snoozed" ? <AlarmClockOff className="size-3.5" /> : <Undo2 className="size-3.5" />}</button>
		</ContextMenu.Trigger>
		<DropdownMenuContent className="w-64"><ThreadMenuItems task={task} scope={scope} onScope={onScope} onRename={() => setRenaming(true)} onDelete={() => setDeleting(true)} onCustomSnooze={() => setCustomSnooze(true)} /></DropdownMenuContent>
		<CustomSnoozeDialog open={customSnooze} onOpenChange={setCustomSnooze} onSnooze={until => void actions.snooze(task, until, scope)} />
		<DeleteChatDialog task={task} scope={scope} open={deleting} onOpenChange={setDeleting} />
	</ContextMenu.Root>;
}

/** T3's collapsible section heading: label, a rule, and a chevron. Collapsed headings show the count. */
function SectionHeader({ label, count, open, onToggle, tone }: { label: string; count: number; open: boolean; onToggle: () => void; tone?: "info" }) {
	return <button type="button" aria-expanded={open} onClick={onToggle} className={cn("mx-2 flex h-8 w-[calc(100%-1rem)] items-center gap-2 px-2.5 text-xs font-medium", tone === "info" ? "text-sky-600 dark:text-sky-400" : "text-muted-foreground/70 hover:text-muted-foreground")}>
		<span>{open ? label : `${label} (${count})`}</span><span className="h-px flex-1 bg-sidebar-border/60" /><ChevronDown className={cn("size-3 transition-transform", !open && "rotate-180")} />
	</button>;
}

export function CodeThreadList() {
	const { overview, api, setOverview, setError, selectedId } = useWorkspace();
	const [scope, setScope] = usePersistedState("phaseo.desktop.codeProjectScope", "");
	const [snoozedOpen, setSnoozedOpen] = usePersistedState("phaseo.desktop.sidebar.snoozedExpanded", false);
	const [settledOpen, setSettledOpen] = usePersistedState("phaseo.desktop.sidebar.settledExpanded", false);
	const [settledShown, setSettledShown] = useState(10);
	const projects = overview.projects.filter(project => !project.worktree?.removedAt);
	const scoped = projects.find(project => project.id === scope);
	const running = overview.tasks.some(task => task.projectId && task.status === "running");
	const now = useNow(running ? 1_000 : 30_000);
	const sections = useMemo(() => codeSections(overview.tasks, overview.projects, scoped ? scope : "", now), [overview.tasks, overview.projects, scope, scoped, now]);
	const addProject = () => { if (api) void api.chooseProject().then(setOverview, reason => setError(errorText(reason))); };
	// The open chat stays visible inside a collapsed section.
	const visibleIn = (list: TaskOverview[], open: boolean, limit = Infinity) => open ? list.slice(0, limit) : list.filter(task => task.id === selectedId);
	const ordered = [...sections.pinned, ...sections.active].map(task => task.id);
	publishSidebarOrder(ordered);
	const hints = useJumpHints();
	const card = (task: TaskOverview) => { const index = ordered.indexOf(task.id); return <CardRow key={task.id} task={task} now={now} scope={scoped ? scope : ""} onScope={setScope} hint={hints && index >= 0 && index < 9 ? index + 1 : undefined} />; };
	const slim = (task: TaskOverview, kind: "snoozed" | "settled") => <SlimRow key={task.id} task={task} now={now} kind={kind} scope={scoped ? scope : ""} onScope={setScope} />;
	return <div className="flex flex-1 flex-col pb-3">
		<div className="flex h-9 items-center gap-1 px-3 pt-1">
			<DropdownMenu>
				<DropdownMenuTrigger render={<button type="button" className="flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-bold text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-foreground" />}>
					<span className="truncate">{scoped?.name ?? "All projects"}</span><ChevronDown className="size-3 shrink-0" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-56">
					<DropdownMenuItem onClick={() => setScope("")}>All projects{!scoped && <Check className="ml-auto" />}</DropdownMenuItem>
					<DropdownMenuSeparator />
					{projects.map(project => <DropdownMenuItem key={project.id} onClick={() => setScope(project.id)}><FolderOpen /><span className="truncate">{project.name}</span>{project.id === scope && <Check className="ml-auto" />}</DropdownMenuItem>)}
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={addProject}><FolderPlus />Add project…</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<button type="button" aria-label="Add project" title="Add project" onClick={addProject} className="ml-auto grid size-6 place-items-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"><Plus className="size-3.5" /></button>
		</div>
		{!projects.length && <div className="px-4 pt-1 pb-3">
			<p className="text-xs text-muted-foreground">No projects yet. Open a folder to start coding with an agent.</p>
			<button type="button" onClick={addProject} className="mt-3 inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/85"><FolderPlus className="size-3.5" />Add project</button>
		</div>}
		{projects.length > 0 && !sections.pinned.length && !sections.active.length && <p className="px-4 py-3 text-xs text-muted-foreground">{scoped ? `No chats in ${scoped.name} yet` : "No chats yet"}</p>}
		<div className="flex flex-col gap-0.5">{sections.pinned.map(card)}{sections.active.map(card)}</div>
		<div className="mt-auto flex flex-col pt-3">
			{sections.snoozed.length > 0 && <>
				<SectionHeader label="Snoozed" count={sections.snoozed.length} open={snoozedOpen} onToggle={() => setSnoozedOpen(!snoozedOpen)} tone="info" />
				{visibleIn(sections.snoozed, snoozedOpen).map(task => slim(task, "snoozed"))}
			</>}
			<SectionHeader label="Settled" count={sections.settled.length} open={settledOpen} onToggle={() => setSettledOpen(!settledOpen)} />
			{visibleIn(sections.settled, settledOpen, settledShown).map(task => slim(task, "settled"))}
			{settledOpen && sections.settled.length > settledShown && <button type="button" onClick={() => setSettledShown(shown => shown + 25)} className="mx-2 flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground"><Plus className="size-3.5" />Show {Math.min(25, sections.settled.length - settledShown)} more</button>}
			{settledOpen && !sections.settled.length && <p className="px-4 py-1 text-xs text-muted-foreground/70">Settled chats appear here.</p>}
		</div>
	</div>;
}
