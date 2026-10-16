import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from "react";
import { JumpHint, publishSidebarOrder, useJumpHints } from "../lib/sidebarOrder";
import { ContextMenu } from "@base-ui/react/context-menu";
import { AlarmClock, AlarmClockOff, Check, ChevronDown, CircleAlert, CircleCheck, CircleDashed, CircleDotDashed, Clock, FolderPlus, GitBranch, MessageCircleQuestion, Pin, PinOff, Plus, Settings, ShieldQuestion, Trash2, Undo2 } from "lucide-react";
import { ProjectIcon } from "../components/ProjectIcon";
import { useRemoveProject } from "../settings/removeProject";
import { hasWoken, isUnread, settleBlocker, shortDuration } from "../../shared/threadLifecycle";
import type { TaskOverview } from "../../shared/workspaceOverview";
import { errorText, useWorkspace } from "../app/workspace";
import { TagDots } from "../components/Tags";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { Tip } from "../components/ui/tooltip";
import { ModelStack } from "../chat/ModelPicker";
import { usePersistedState } from "../lib/persistedState";
import { cn } from "../lib/utils";
import { codeSections, createReturnTracker, workingSectionKey } from "./codeThreads";
import { BulkMenuItems, CustomSnoozeDialog, DeleteChatDialog, RenameInput, SnoozeItems, ThreadMenuItems, useThreadActions } from "./threadActions";
import { chatDragType } from "../../shared/mentions";
import { PullRequestBadge } from "../views/pullRequests/PullRequestBadge";

/** A Code chat being dragged within the sidebar. */
const codeRowType = "application/x-phaseo-code-chat";
// When this window saw each chat leave the Working section; kept at module scope so the order survives remounts.
const returns = createReturnTracker();

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
	if (task.status === "running") return label(<CircleDashed className="size-3.5 animate-spin [animation-duration:3s]" />, <>Working <span className="tabular-nums">{elapsed(task.lastUserMessageAt, now)}</span></>, "text-info");
	if (task.status === "waiting") return label(<CircleDotDashed className="size-3.5" />, "Waiting", "text-muted-foreground");
	if (task.status === "failed" || task.status === "interrupted") return label(<CircleAlert className="size-3.5" />, task.status === "failed" ? "Failed" : "Stopped", "text-destructive");
	if (task.status === "limited") return label(<CircleAlert className="size-3.5" />, "Limited", "text-warning");
	if (hasWoken(task, now)) return <Tip label="Dismiss"><button type="button" onClick={event => { event.stopPropagation(); onDismissWake(); }} className="flex shrink-0 items-center gap-1 rounded text-[11px] font-medium text-warning hover:underline"><AlarmClock className="size-3.5" />Woke</button></Tip>;
	if (isUnread(task)) return label(<CircleCheck className="size-3.5" />, "Done", "text-success");
	const at = task.lastUserMessageAt ?? task.createdAt;
	return <span className="shrink-0 text-[11px] text-muted-foreground">{shortDuration(now - Date.parse(at))}</span>;
}

/** A chat in the pinned, active or working list: project, title, then branch, tags and model. Working rows are not dragged. */
type RowControls = { picked: boolean; bulk?: ReactNode; onPick: (event: MouseEvent) => boolean; drag?: { onDragStart: (event: DragEvent) => void; onDragOver: (event: DragEvent) => void; onDrop: (event: DragEvent) => void; onDragEnd: () => void }; dropLine?: "above" | "below" };

function CardRow({ task, now, scope, onScope, hint, controls }: { task: TaskOverview; now: number; scope: string; onScope: (id: string) => void; hint?: number; controls: RowControls }) {
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
		<ContextMenu.Trigger render={<div role="button" tabIndex={0} data-row-id={task.id} aria-current={selected ? "page" : undefined} aria-selected={controls.picked || undefined} draggable={!renaming && Boolean(controls.drag)} onClick={event => { if (!controls.onPick(event)) select(task.id); }} onKeyDown={event => { if (event.key === "Enter") select(task.id); }} {...controls.drag} />}
			className={cn("group/row relative mx-2 flex h-[4.5rem] flex-col justify-center gap-0.5 rounded-md px-2.5 outline-none hover:bg-sidebar-accent/70 focus-visible:ring-2 focus-visible:ring-ring/40", selected && "bg-sidebar-accent", controls.picked && "bg-primary/10 ring-1 ring-primary/30 ring-inset")}>
			{controls.dropLine && <span aria-hidden className={cn("pointer-events-none absolute inset-x-2 h-0.5 rounded-full bg-primary", controls.dropLine === "above" ? "-top-px" : "-bottom-px")} />}
			<div className="flex h-5 items-center gap-1.5 text-xs text-muted-foreground">
				<ProjectIcon project={project} className="size-3.5" /><span className="min-w-0 truncate">{project?.name}</span>
				{task.pinned && <Tip label="Unpin chat"><button type="button" aria-label="Unpin chat" onClick={event => { event.stopPropagation(); void actions.pin(task); }} className="group/pin grid size-4 shrink-0 place-items-center rounded hover:text-foreground"><Pin className="size-3 group-hover/pin:hidden" /><PinOff className="hidden size-3 group-hover/pin:block" /></button></Tip>}
				<span className="ml-auto flex items-center group-hover/row:hidden group-has-[:focus-visible]/row:hidden">{hint !== undefined ? <JumpHint index={hint} /> : <StatusLabel task={task} now={now} onDismissWake={() => void actions.wake(task)} />}</span>
				<span className="ml-auto hidden items-center gap-0.5 group-hover/row:flex group-has-[:focus-visible]/row:flex" onClick={event => event.stopPropagation()}>
					<DropdownMenu>
						<Tip label="Snooze chat"><DropdownMenuTrigger render={<button type="button" aria-label="Snooze chat" className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-background/70 hover:text-foreground" />}><Clock className="size-3.5" /></DropdownMenuTrigger></Tip>
						<DropdownMenuContent align="end" className="w-56"><SnoozeItems onSnooze={until => void actions.snooze(task, until, scope)} onCustom={() => setCustomSnooze(true)} /></DropdownMenuContent>
					</DropdownMenu>
					{/* A disabled button gets no pointer events, so its reason sits on a wrapper. */}
					<Tip label={blocked ?? "Settle chat"}><span className="inline-flex"><button type="button" aria-label="Settle chat" disabled={Boolean(blocked)} onClick={() => void actions.settle(task, scope)}
						className="flex h-5 items-center gap-1 rounded px-1.5 text-[11px] font-medium text-muted-foreground hover:bg-background/70 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"><Check className="size-3.5" />Settle</button></span></Tip>
				</span>
			</div>
			{renaming ? <RenameInput task={task} onDone={() => setRenaming(false)} /> : <div className={cn("truncate text-[13px]", quiet ? "text-sidebar-foreground/80" : "font-medium text-sidebar-foreground")}>{task.title}</div>}
			<div className="flex h-4 items-center gap-1.5 text-[11px] text-muted-foreground/70">
				{project?.worktree && <span className="flex min-w-0 items-center gap-1 truncate font-mono"><GitBranch className="size-3 shrink-0" />{project.worktree.branch}</span>}
				<PullRequestBadge taskId={task.id} projectId={task.projectId} links={task.pullRequests} />
				<TagDots tags={task.tags} />
				<span className="ml-auto shrink-0"><ModelStack models={[task]} size="sm" ringClassName="ring-transparent" /></span>
			</div>
		</ContextMenu.Trigger>
		<DropdownMenuContent className="w-64">{controls.bulk ?? <ThreadMenuItems task={task} scope={scope} onScope={onScope} onRename={() => setRenaming(true)} onDelete={() => setDeleting(true)} onCustomSnooze={() => setCustomSnooze(true)} />}</DropdownMenuContent>
		<CustomSnoozeDialog open={customSnooze} onOpenChange={setCustomSnooze} onSnooze={until => void actions.snooze(task, until, scope)} />
		<DeleteChatDialog task={task} scope={scope} open={deleting} onOpenChange={setDeleting} />
	</ContextMenu.Root>;
}

/** A snoozed or settled chat: just the title, and when it wakes or how long ago it settled. */
function SlimRow({ task, now, kind, scope, onScope }: { task: TaskOverview; now: number; kind: "snoozed" | "settled"; scope: string; onScope: (id: string) => void }) {
	const { overview, selectedId, select } = useWorkspace();
	const actions = useThreadActions();
	const [customSnooze, setCustomSnooze] = useState(false);
	const [renaming, setRenaming] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const selected = task.id === selectedId;
	const project = overview.projects.find(value => value.id === task.projectId);
	const when = kind === "snoozed" ? shortDuration(Date.parse(task.snoozedUntil!) - now) : shortDuration(now - Date.parse(task.settledAt ?? task.updatedAt));
	const action = kind === "snoozed" ? "Wake chat now" : "Un-settle chat";
	return <ContextMenu.Root>
		<ContextMenu.Trigger render={<div role="button" tabIndex={0} aria-current={selected ? "page" : undefined} onClick={() => select(task.id)} onKeyDown={event => { if (event.key === "Enter") select(task.id); }} />}
			className={cn("group/row mx-2 flex h-9 items-center gap-2 rounded-md px-2.5 text-[13px] outline-none hover:bg-sidebar-accent/70 focus-visible:ring-2 focus-visible:ring-ring/40", selected && "bg-sidebar-accent")}>
			<span className="flex shrink-0 opacity-40 grayscale group-hover/row:opacity-100 group-hover/row:grayscale-0"><ProjectIcon project={project} className="size-3.5" /></span>
			{renaming ? <RenameInput task={task} onDone={() => setRenaming(false)} /> : <span className="min-w-0 flex-1 truncate text-sidebar-foreground/70">{task.title}</span>}
			<span className={cn("shrink-0 text-[11px] group-hover/row:hidden", kind === "snoozed" ? "text-info" : "text-muted-foreground")}>{when}</span>
			<Tip label={action}><button type="button" onClick={event => { event.stopPropagation(); void (kind === "snoozed" ? actions.wake(task) : actions.unsettle(task)); }} aria-label={action}
				className="hidden size-5 shrink-0 place-items-center rounded text-muted-foreground group-hover/row:grid hover:bg-background/70 hover:text-foreground">{kind === "snoozed" ? <AlarmClockOff className="size-3.5" /> : <Undo2 className="size-3.5" />}</button></Tip>
		</ContextMenu.Trigger>
		<DropdownMenuContent className="w-64"><ThreadMenuItems task={task} scope={scope} onScope={onScope} onRename={() => setRenaming(true)} onDelete={() => setDeleting(true)} onCustomSnooze={() => setCustomSnooze(true)} /></DropdownMenuContent>
		<CustomSnoozeDialog open={customSnooze} onOpenChange={setCustomSnooze} onSnooze={until => void actions.snooze(task, until, scope)} />
		<DeleteChatDialog task={task} scope={scope} open={deleting} onOpenChange={setDeleting} />
	</ContextMenu.Root>;
}

/** T3's collapsible section heading: label, a rule, and a chevron. Collapsed headings show the count. */
function SectionHeader({ label, count, open, onToggle, tone, drop }: { label: string; count: number; open: boolean; onToggle: () => void; tone?: "info"; drop?: { active: boolean; onDragOver: (event: DragEvent) => void; onDragLeave: () => void; onDrop: (event: DragEvent) => void } }) {
	return <button type="button" aria-expanded={open} onClick={onToggle} onDragOver={drop?.onDragOver} onDragLeave={drop?.onDragLeave} onDrop={drop?.onDrop} className={cn("mx-2 flex h-8 w-[calc(100%-1rem)] items-center gap-2 rounded-md px-2.5 text-xs font-medium", drop?.active ? "bg-primary/10 text-primary" : tone === "info" ? "text-info" : "text-muted-foreground/70 hover:text-muted-foreground")}>
		<span>{open ? label : `${label} (${count})`}</span><span className="h-px flex-1 bg-sidebar-border/60" /><ChevronDown className={cn("size-3 transition-transform", !open && "rotate-180")} />
	</button>;
}

export function CodeThreadList() {
	const { overview, api, setOverview, setError, selectedId, openProjectSettings } = useWorkspace();
	const [scope, setScope] = usePersistedState("phaseo.desktop.codeProjectScope", "");
	const [workingEnabled] = usePersistedState(workingSectionKey, false);
	const [workingOpen, setWorkingOpen] = usePersistedState("phaseo.desktop.sidebar.workingExpanded", false);
	const [snoozedOpen, setSnoozedOpen] = usePersistedState("phaseo.desktop.sidebar.snoozedExpanded", false);
	const [settledOpen, setSettledOpen] = usePersistedState("phaseo.desktop.sidebar.settledExpanded", false);
	const [settledShown, setSettledShown] = useState(10);
	const { command } = useWorkspace();
	const actions = useThreadActions();
	const removeProject = useRemoveProject();
	// Ctrl/⌘-click picks chats, Shift-click picks a range; right-click a picked chat for the bulk menu (T3).
	const [picked, setPicked] = useState<string[]>([]);
	const anchor = useRef<string | undefined>(undefined);
	const [dropAt, setDropAt] = useState<{ id: string; after: boolean } | "settled">();
	const cards = useRef<HTMLDivElement>(null);
	const tops = useRef(new Map<string, number>());
	useEffect(() => {
		if (!picked.length) return;
		const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setPicked([]); };
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [picked.length]);
	const projects = overview.projects.filter(project => !project.worktree?.removedAt);
	const scoped = projects.find(project => project.id === scope);
	const running = overview.tasks.some(task => task.projectId && task.status === "running");
	const now = useNow(running ? 1_000 : 30_000);
	const sections = useMemo(() => {
		returns.observe(workingEnabled ? overview.tasks : null);
		return codeSections(overview.tasks, overview.projects, scoped ? scope : "", now, { working: workingEnabled, returnedAt: returns.returnedAt });
	}, [overview.tasks, overview.projects, scope, scoped, now, workingEnabled]);
	const addProject = () => { if (api) void api.chooseProject().then(setOverview, reason => setError(errorText(reason))); };
	// The open chat stays visible inside a collapsed section.
	const visibleIn = (list: TaskOverview[], open: boolean, limit = Infinity) => open ? list.slice(0, limit) : list.filter(task => task.id === selectedId);
	const visibleWorking = visibleIn(sections.working, workingOpen);
	const ordered = [...sections.pinned, ...sections.active, ...visibleWorking].map(task => task.id);
	publishSidebarOrder(ordered);
	const hints = useJumpHints();
	const draggedId = (event: DragEvent) => event.dataTransfer.types.includes(codeRowType) ? event.dataTransfer.getData(codeRowType) || "pending" : undefined;
	const pick = (task: TaskOverview, event: MouseEvent) => {
		if (event.ctrlKey || event.metaKey) { setPicked(current => current.includes(task.id) ? current.filter(id => id !== task.id) : [...current, task.id]); anchor.current = task.id; return true; }
		if (event.shiftKey && anchor.current && ordered.includes(anchor.current)) {
			const [from, to] = [ordered.indexOf(anchor.current), ordered.indexOf(task.id)].sort((a, b) => a - b);
			setPicked(ordered.slice(from, to + 1)); return true;
		}
		setPicked([]); anchor.current = task.id; return false;
	};
	// Dropping on a card moves the chat there, pinning or unpinning it to match the section it lands in.
	// With the Working section on, the active list is ordered by time, so a drop there only pins or unpins (T3).
	const dropOn = async (target: TaskOverview, after: boolean, id: string) => {
		const moved = overview.tasks.find(task => task.id === id);
		if (!moved || moved.id === target.id) return;
		const section = target.pinned ? sections.pinned : sections.active;
		const list = section.filter(task => task.id !== id).map(task => task.id);
		list.splice(list.indexOf(target.id) + (after ? 1 : 0), 0, id);
		if (Boolean(moved.pinned) !== Boolean(target.pinned) && !await command({ type: "update-task", id, pinned: target.pinned })) return;
		if (target.pinned || !workingEnabled) await command({ type: "reorder", ids: list });
	};
	const controls = (task: TaskOverview, fixed = false): RowControls => {
		const isPicked = picked.includes(task.id);
		const chosen = isPicked && picked.length > 1 ? overview.tasks.filter(value => picked.includes(value.id)) : undefined;
		return {
			picked: isPicked,
			bulk: chosen && <BulkMenuItems tasks={chosen} scope={scoped ? scope : ""} onDone={() => setPicked([])} />,
			onPick: event => pick(task, event),
			// T3's Working section follows live status, so its rows are neither dragged nor dropped on.
			drag: fixed ? undefined : {
				onDragStart: event => { event.dataTransfer.setData(codeRowType, task.id); event.dataTransfer.setData(chatDragType, JSON.stringify({ id: task.id, title: task.title })); event.dataTransfer.setData("text/plain", task.title); event.dataTransfer.effectAllowed = "copyMove"; },
				onDragOver: event => { if (!draggedId(event)) return; event.preventDefault(); const box = event.currentTarget.getBoundingClientRect(); const after = event.clientY > box.top + box.height / 2; if (typeof dropAt !== "object" || dropAt.id !== task.id || dropAt.after !== after) setDropAt({ id: task.id, after }); },
				onDrop: event => { const id = draggedId(event); setDropAt(undefined); if (!id) return; event.preventDefault(); const box = event.currentTarget.getBoundingClientRect(); void dropOn(task, event.clientY > box.top + box.height / 2, id); },
				onDragEnd: () => setDropAt(undefined),
			},
			dropLine: !fixed && typeof dropAt === "object" && dropAt.id === task.id ? dropAt.after ? "below" : "above" : undefined,
		};
	};
	const settledDrop = {
		active: dropAt === "settled",
		onDragOver: (event: DragEvent) => { if (!draggedId(event)) return; event.preventDefault(); setDropAt("settled"); },
		onDragLeave: () => setDropAt(undefined),
		onDrop: (event: DragEvent) => { const id = draggedId(event); setDropAt(undefined); const task = overview.tasks.find(value => value.id === id); if (!task) return; event.preventDefault(); void actions.settle(task, scoped ? scope : ""); },
	};
	// T3's motion: rows that move slide from their old place (at most 40px) over 150 ms, unless motion is reduced.
	useLayoutEffect(() => {
		const rows = [...cards.current?.querySelectorAll<HTMLElement>("[data-row-id]") ?? []];
		const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		const next = new Map(rows.map(row => [row.dataset.rowId!, row.getBoundingClientRect().top]));
		if (!reduce && rows.length <= 40) for (const row of rows) {
			const before = tops.current.get(row.dataset.rowId!), after = next.get(row.dataset.rowId!)!;
			if (before === undefined || Math.abs(before - after) < 1) continue;
			const offset = Math.max(-40, Math.min(40, before - after));
			row.animate([{ transform: `translateY(${offset}px)` }, { transform: "translateY(0)" }], { duration: 150, easing: "ease-out" });
		}
		tops.current = next;
	});
	const card = (task: TaskOverview, fixed = false) => { const index = ordered.indexOf(task.id); return <CardRow key={task.id} task={task} now={now} scope={scoped ? scope : ""} onScope={setScope} hint={hints && index >= 0 && index < 9 ? index + 1 : undefined} controls={controls(task, fixed)} />; };
	const slim = (task: TaskOverview, kind: "snoozed" | "settled") => <SlimRow key={task.id} task={task} now={now} kind={kind} scope={scoped ? scope : ""} onScope={setScope} />;
	return <div className="flex flex-1 flex-col pb-3">
		<div className="flex h-9 items-center gap-1 px-3 pt-1">
			<DropdownMenu>
				<DropdownMenuTrigger render={<button type="button" className="flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-bold text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-foreground" />}>
					<span className="truncate">{scoped?.name ?? "All projects"}</span><ChevronDown className="size-3 shrink-0" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-60">
					<DropdownMenuItem onClick={() => setScope("")}>All projects{!scoped && <Check className="ml-auto" />}</DropdownMenuItem>
					<DropdownMenuSeparator />
					{/* T3's project picker: each project has a settings button at the end of its row. */}
					{projects.map(project => <DropdownMenuItem key={project.id} onClick={() => setScope(project.id)} className="group/project pr-1">
						<ProjectIcon project={project} /><span className="min-w-0 flex-1 truncate">{project.name}</span>{project.id === scope && <Check />}
						<Tip label={`Project settings for ${project.name}`} side="right"><button type="button" aria-label={`Project settings for ${project.name}`} onPointerDown={event => event.stopPropagation()} onClick={event => { event.preventDefault(); event.stopPropagation(); openProjectSettings(project.id); }}
							className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 group-hover/project:opacity-100 group-focus-visible/project:opacity-100 hover:bg-accent hover:text-foreground"><Settings className="size-3.5" /></button></Tip>
					</DropdownMenuItem>)}
					<DropdownMenuSeparator />
					{scoped && <DropdownMenuItem onClick={() => openProjectSettings(scoped.id)}><Settings />Project settings</DropdownMenuItem>}
					{scoped && !scoped.worktree && <DropdownMenuItem variant="destructive" onClick={() => void removeProject(scoped).then(removed => { if (removed) setScope(""); })}><Trash2 />Remove project</DropdownMenuItem>}
					<DropdownMenuItem onClick={addProject}><FolderPlus />Add project…</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<Tip label="Add project"><button type="button" aria-label="Add project" onClick={addProject} className="ml-auto grid size-6 place-items-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"><Plus className="size-3.5" /></button></Tip>
		</div>
		{!projects.length && <div className="px-4 pt-1 pb-3">
			<p className="text-xs text-muted-foreground">No projects yet. Open a folder to start coding with an agent.</p>
			<button type="button" onClick={addProject} className="mt-3 inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/85"><FolderPlus className="size-3.5" />Add project</button>
		</div>}
		{projects.length > 0 && !sections.pinned.length && !sections.active.length && !sections.working.length && <p className="px-4 py-3 text-xs text-muted-foreground">{scoped ? `No chats in ${scoped.name} yet` : "No chats yet"}</p>}
		<div ref={cards} className="flex flex-col gap-0.5">{sections.pinned.map(task => card(task))}{sections.active.map(task => card(task))}</div>
		<div className="mt-auto flex flex-col pt-3">
			{sections.working.length > 0 && <>
				<SectionHeader label="Working" count={sections.working.length} open={workingOpen} onToggle={() => setWorkingOpen(!workingOpen)} />
				<div className="flex flex-col gap-0.5 pb-1">{visibleWorking.map(task => card(task, true))}</div>
			</>}
			{sections.snoozed.length > 0 && <>
				<SectionHeader label="Snoozed" count={sections.snoozed.length} open={snoozedOpen} onToggle={() => setSnoozedOpen(!snoozedOpen)} tone="info" />
				{visibleIn(sections.snoozed, snoozedOpen).map(task => slim(task, "snoozed"))}
			</>}
			<SectionHeader label="Settled" count={sections.settled.length} open={settledOpen} onToggle={() => setSettledOpen(!settledOpen)} drop={settledDrop} />
			{visibleIn(sections.settled, settledOpen, settledShown).map(task => slim(task, "settled"))}
			{settledOpen && sections.settled.length > settledShown && <button type="button" onClick={() => setSettledShown(shown => shown + 25)} className="mx-2 flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground"><Plus className="size-3.5" />Show {Math.min(25, sections.settled.length - settledShown)} more</button>}
			{settledOpen && !sections.settled.length && <p className="px-4 py-1 text-xs text-muted-foreground/70">Settled chats appear here.</p>}
		</div>
	</div>;
}
