import { useMemo, useState, type ReactNode } from "react";
import { Archive, CalendarClock, Columns3, Ellipsis, LogIn, Pencil, Pin, PinOff, Plus, Settings } from "lucide-react";
import { ScrollArea } from "../components/ui/scroll-area";
import { chatDragType } from "../../shared/mentions";
import type { TaskOverview } from "../../shared/workspaceOverview";
import { usablePhaseoAccounts, useWorkspace, type CompareGroup } from "../app/workspace";
import { cn } from "../lib/utils";
import { shortcutLabel } from "../lib/shortcuts";
import { usePersistedState } from "../lib/persistedState";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { SettingsNav } from "../settings/SettingsPage";
import { ModelStack } from "../chat/ModelPicker";
import { useScheduledTasks } from "../views/ScheduledTasks";
import { CodeThreadList } from "./CodeThreadList";
import { dismissUndo, runUndo, undoLabel, useThreadUndo } from "./threadUndo";
import { TagChip, TagDots, TagMenu } from "../components/Tags";
import { tagsInUse } from "../../shared/tags";

const dayMs = 86_400_000;
function dateBucket(iso: string, now = new Date()) {
	const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	const time = Date.parse(iso);
	if (time >= start) return "Today";
	if (time >= start - dayMs) return "Yesterday";
	if (time >= start - 7 * dayMs) return "Previous 7 days";
	if (time >= start - 30 * dayMs) return "Previous 30 days";
	return new Date(time).toLocaleDateString(undefined, { month: "long", year: now.getFullYear() === new Date(time).getFullYear() ? undefined : "numeric" });
}

function relative(iso: string) {
	const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes}m`;
	if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`;
	if (minutes < 60 * 24 * 7) return `${Math.round(minutes / 60 / 24)}d`;
	return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function StatusDot({ task, className }: { task: TaskOverview; className?: string }) {
	const attention = task.approvalsCount || task.answersCount || task.status === "waiting";
	const tone = attention ? "bg-warning" : task.status === "running" ? "bg-primary animate-pulse" : task.status === "failed" || task.status === "interrupted" ? "bg-destructive" : task.status === "limited" ? "bg-warning/70" : "bg-muted-foreground/40";
	const label = attention ? "Needs your input" : task.status === "running" ? "Working" : task.status === "failed" ? "Failed" : task.status === "interrupted" ? "Interrupted" : task.status === "limited" ? "Usage limit reached" : "Idle";
	return <span role="img" aria-label={label} title={label} className={cn("size-1.5 shrink-0 rounded-full", tone, className)} />;
}

function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
	return <div className="flex h-8 items-center justify-between px-4 pt-2 text-xs font-bold text-sidebar-foreground/70">{children}{action}</div>;
}

function RowMenu({ task, onRename }: { task: TaskOverview; onRename: () => void }) {
	const { command } = useWorkspace();
	return <DropdownMenu>
		<DropdownMenuTrigger render={<button type="button" aria-label={`Actions for ${task.title}`} onClick={event => event.stopPropagation()} className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground opacity-0 group-hover/row:opacity-100 hover:bg-background/70 hover:text-foreground data-popup-open:opacity-100 [&_svg]:size-3.5" />}><Ellipsis /></DropdownMenuTrigger>
		<DropdownMenuContent align="start" className="w-44">
			<DropdownMenuItem onClick={onRename}><Pencil />Rename</DropdownMenuItem>
			<DropdownMenuItem onClick={() => void command({ type: "update-task", id: task.id, pinned: !task.pinned })}>{task.pinned ? <PinOff /> : <Pin />}{task.pinned ? "Unpin" : "Pin"}</DropdownMenuItem>
			<TagMenu task={task} />
			<DropdownMenuSeparator />
			<DropdownMenuItem onClick={() => void command({ type: "update-task", id: task.id, archived: !task.archived })}><Archive />{task.archived ? "Unarchive" : "Archive"}</DropdownMenuItem>
		</DropdownMenuContent>
	</DropdownMenu>;
}

function ChatRow({ task, indent, showModel, showTime = true }: { task: TaskOverview; indent?: boolean; showModel?: boolean; showTime?: boolean }) {
	const { selectedId, select, command } = useWorkspace();
	const [renaming, setRenaming] = useState(false);
	const selected = task.id === selectedId;
	const busy = task.status === "running" || task.status === "waiting" || !!task.approvalsCount || !!task.answersCount;
	// Dragging a chat into a composer mentions it there.
	return <div role="button" tabIndex={0} aria-current={selected ? "page" : undefined} onClick={() => select(task.id)} onKeyDown={event => { if (event.key === "Enter" && !renaming) select(task.id); }}
		draggable={!renaming} onDragStart={event => { event.dataTransfer.setData(chatDragType, JSON.stringify({ id: task.id, title: task.title })); event.dataTransfer.setData("text/plain", task.title); event.dataTransfer.effectAllowed = "copy"; }}
		className={cn("group/row mx-2 flex h-8 items-center gap-2 rounded-md px-2 text-[13px] text-sidebar-foreground/85 outline-none hover:bg-sidebar-accent/70 focus-visible:ring-2 focus-visible:ring-ring/40", selected && "bg-sidebar-accent text-sidebar-foreground", indent && "pl-7")}>
		{showModel ? <span className="shrink-0"><ModelStack models={[task]} size="sm" ringClassName="ring-transparent" /></span> : <StatusDot task={task} />}
		{renaming
			? <input autoFocus defaultValue={task.title} maxLength={200} aria-label="Chat title" onClick={event => event.stopPropagation()} className="h-6 min-w-0 flex-1 rounded border border-ring bg-background px-1.5 text-[13px] outline-none"
				onBlur={event => { const title = event.target.value.trim(); setRenaming(false); if (title && title !== task.title) void command({ type: "update-task", id: task.id, title }); }}
				onKeyDown={event => { event.stopPropagation(); if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") setRenaming(false); }} />
			: <span className="min-w-0 flex-1 truncate">{task.title}</span>}
		{!renaming && <TagDots tags={task.tags} />}
		{showModel && busy && <StatusDot task={task} />}
		{showTime && !renaming && <span className="text-[11px] text-muted-foreground group-hover/row:hidden">{relative(task.updatedAt)}</span>}
		{!renaming && <RowMenu task={task} onRename={() => setRenaming(true)} />}
	</div>;
}

function CompareRow({ group }: { group: CompareGroup }) {
	const { compareId, openCompare, removeCompareGroup, taskById } = useWorkspace();
	const tasks = group.taskIds.map(taskById).filter((task): task is TaskOverview => !!task);
	return <div role="button" tabIndex={0} aria-current={compareId === group.id ? "page" : undefined} onClick={() => openCompare(group.id)} onKeyDown={event => { if (event.key === "Enter") openCompare(group.id); }}
		className={cn("group/row mx-2 flex h-8 items-center gap-2 rounded-md px-2 text-[13px] text-sidebar-foreground/85 hover:bg-sidebar-accent/70", compareId === group.id && "bg-sidebar-accent text-sidebar-foreground")}>
		<Columns3 className="size-4 shrink-0 text-muted-foreground" />
		<span className="min-w-0 flex-1 truncate">{group.title}</span>
		<span><ModelStack models={tasks.slice(0, 3)} size="sm" ringClassName="bg-sidebar ring-sidebar" /></span>
		<DropdownMenu>
			<DropdownMenuTrigger render={<button type="button" aria-label={`Actions for ${group.title}`} onClick={event => event.stopPropagation()} className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground opacity-0 group-hover/row:opacity-100 hover:bg-background/70 [&_svg]:size-3.5" />}><Ellipsis /></DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-44"><DropdownMenuItem onClick={() => removeCompareGroup(group.id)}><Archive />Ungroup</DropdownMenuItem></DropdownMenuContent>
		</DropdownMenu>
	</div>;
}

function ChatList() {
	const { overview, compareGroups } = useWorkspace();
	const grouped = useMemo(() => new Set(compareGroups.flatMap(group => group.taskIds)), [compareGroups]);
	const all = overview.tasks.filter(task => !task.projectId && !task.delegation?.parentTaskId && !task.archived && !grouped.has(task.id));
	const tags = useMemo(() => tagsInUse(all), [all]);
	const [filter, setFilter] = usePersistedState("phaseo.desktop.chatTagFilter", "");
	const active = tags.find(tag => tag.toLowerCase() === filter.toLowerCase());
	const chats = active ? all.filter(task => task.tags?.some(tag => tag.toLowerCase() === active.toLowerCase())) : all;
	const groups = active ? [] : compareGroups;
	const pinned = chats.filter(task => task.pinned);
	type Item = { kind: "task"; task: TaskOverview; at: string } | { kind: "compare"; group: CompareGroup; at: string };
	const items: Item[] = [
		...chats.filter(task => !task.pinned).map(task => ({ kind: "task" as const, task, at: task.updatedAt })),
		...groups.map(group => ({ kind: "compare" as const, group, at: group.taskIds.map(id => overview.tasks.find(task => task.id === id)?.updatedAt ?? group.createdAt).sort().at(-1)! })),
	].sort((a, b) => b.at.localeCompare(a.at));
	const buckets = new Map<string, Item[]>();
	for (const item of items) { const key = dateBucket(item.at); buckets.set(key, [...buckets.get(key) ?? [], item]); }
	if (!all.length && !compareGroups.length) return <p className="px-4 py-6 text-center text-xs text-muted-foreground">Your chats will appear here.</p>;
	return <>
		{tags.length > 0 && <div role="group" aria-label="Filter chats by tag" className="flex flex-wrap gap-1 px-3 pt-2 pb-1">
			{tags.slice(0, 12).map(tag => <TagChip key={tag} tag={tag} active={tag === active} onClick={() => setFilter(tag === active ? "" : tag)} className="h-5.5 px-1.5 text-[11px]" />)}
		</div>}
		{active && !chats.length && <p className="px-4 py-4 text-xs text-muted-foreground">No open chats tagged {active}.</p>}
		{pinned.length > 0 && <><SectionLabel>Pinned</SectionLabel>{pinned.map(task => <ChatRow key={task.id} task={task} showModel showTime={false} />)}</>}
		{[...buckets].map(([label, values]) => <div key={label}>
			<SectionLabel>{label}</SectionLabel>
			{values.map(item => item.kind === "task" ? <ChatRow key={item.task.id} task={item.task} showModel showTime={false} /> : <CompareRow key={item.group.id} group={item.group} />)}
		</div>)}
	</>;
}

function AccountFooter() {
	const { overview, openSettings } = useWorkspace();
	const account = usablePhaseoAccounts(overview)[0];
	return <div className="flex items-center gap-2.5 border-t border-sidebar-border p-2.5">
		{account
			? <button type="button" onClick={() => openSettings("accounts")} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md p-1 text-left hover:bg-sidebar-accent/70">
				<span className="grid size-7 shrink-0 place-items-center rounded-full bg-linear-to-br from-[#0078b8] to-[#7c3aed] text-[11px] font-bold text-white">{account.name.slice(0, 2).toUpperCase()}</span>
				<span className="min-w-0"><span className="block truncate text-[12.5px] font-semibold">{account.name}</span><span className="block truncate text-[11px] text-muted-foreground">Signed in to Phaseo</span></span>
			</button>
			: <button type="button" onClick={() => openSettings("accounts")} className="flex flex-1 items-center gap-2 rounded-md p-1.5 text-[12.5px] font-semibold text-primary hover:bg-sidebar-accent/70"><LogIn className="size-4" />Sign in to Phaseo</button>}
		<button type="button" aria-label="Settings" title={`Settings (${shortcutLabel(",")})`} onClick={() => openSettings()} className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"><Settings className="size-4" /></button>
	</div>;
}

/** T3's undo notice: the last settle, snooze, unpin or archive, for five seconds. */
function UndoNotice() {
	const action = useThreadUndo();
	if (!action) return null;
	return <div role="status" className="mx-2.5 mb-2 flex items-center gap-2 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-sm">
		<span className="min-w-0 flex-1 truncate">{undoLabel(action)}</span>
		<button type="button" onClick={() => runUndo()} className="font-semibold text-primary hover:underline">Undo <span className="font-normal text-muted-foreground">{shortcutLabel("Z")}</span></button>
		<button type="button" aria-label="Dismiss" onClick={dismissUndo} className="text-muted-foreground hover:text-foreground">×</button>
	</div>;
}

function ScheduledTasksLink() {
	const { scheduled, openScheduled } = useWorkspace();
	const { tasks } = useScheduledTasks();
	const on = tasks.filter(task => task.enabled).length;
	return <button type="button" aria-current={scheduled ? "page" : undefined} onClick={openScheduled}
		className={cn("mt-1 flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-[13px] text-sidebar-foreground/85 hover:bg-sidebar-accent/70", scheduled && "bg-sidebar-accent text-sidebar-foreground")}>
		<CalendarClock className="size-4 text-muted-foreground" />Scheduled tasks
		{on > 0 && <span className="ml-auto text-[11px] text-muted-foreground" title={`${on} turned on`}>{on}</span>}
	</button>;
}

const sidebarWidths = { min: 200, max: 480, default: 256 };

/** The sidebar's frame: its width is dragged from the right edge and remembered. */
function SidebarFrame({ label, children }: { label: string; children: ReactNode }) {
	const [width, setWidth] = usePersistedState("phaseo.desktop.sidebarWidth", sidebarWidths.default);
	const [dragging, setDragging] = useState(false);
	const clamp = (value: number) => Math.round(Math.min(sidebarWidths.max, Math.max(sidebarWidths.min, value)));
	return <aside aria-label={label} style={{ width: clamp(width) }} className="relative flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
		{children}
		<div role="separator" aria-orientation="vertical" aria-label="Resize sidebar" aria-valuemin={sidebarWidths.min} aria-valuemax={sidebarWidths.max} aria-valuenow={clamp(width)} tabIndex={0} title="Drag to resize, double-click to reset"
			onPointerDown={event => {
				if (event.button !== 0) return;
				event.preventDefault();
				const start = event.clientX, from = clamp(width), target = event.currentTarget;
				target.setPointerCapture(event.pointerId); setDragging(true);
				const move = (next: PointerEvent) => setWidth(clamp(from + next.clientX - start));
				const end = () => { setDragging(false); target.removeEventListener("pointermove", move); target.removeEventListener("pointerup", end); target.removeEventListener("pointercancel", end); };
				target.addEventListener("pointermove", move); target.addEventListener("pointerup", end); target.addEventListener("pointercancel", end);
			}}
			onDoubleClick={() => setWidth(sidebarWidths.default)}
			onKeyDown={event => { const step = event.shiftKey ? 32 : 8; if (event.key === "ArrowLeft") { event.preventDefault(); setWidth(clamp(width - step)); } if (event.key === "ArrowRight") { event.preventDefault(); setWidth(clamp(width + step)); } }}
			className={cn("absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:transition-colors hover:after:bg-ring/60 focus-visible:after:bg-ring", dragging && "after:bg-ring")} />
		{dragging && <div className="fixed inset-0 z-50 cursor-col-resize" />}
	</aside>;
}

export function Sidebar() {
	const { mode, select, selectedId, compareId, setNewChatProjectId, settings, scheduled } = useWorkspace();
	const fresh = !selectedId && !compareId && !scheduled;
	if (settings) return <SidebarFrame label="Settings"><SettingsNav /></SidebarFrame>;
	return <SidebarFrame label={mode === "chat" ? "Chats" : "Projects"}>
		<div className="p-2.5">
			<button type="button" onClick={() => { if (mode === "chat") setNewChatProjectId(""); select(undefined); }}
				className={cn("flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-[13px] font-semibold transition-colors", fresh ? "bg-sidebar-accent text-foreground" : "bg-primary text-primary-foreground hover:bg-primary/85")}>
				<Plus className="size-4" />New chat<span className={cn("ml-auto text-[10.5px] font-medium", fresh ? "text-muted-foreground" : "text-primary-foreground/70")}>{shortcutLabel("N")}</span>
			</button>
			<ScheduledTasksLink />
		</div>
		{mode === "chat"
			? <ScrollArea className="min-h-0 flex-1"><nav className="pb-3"><ChatList /></nav></ScrollArea>
			: <ScrollArea className="min-h-0 flex-1" viewportClassName="[&>div]:min-h-full [&>div]:flex [&>div]:flex-col"><nav aria-label="Code chats" className="flex flex-1 flex-col"><CodeThreadList /></nav></ScrollArea>}
		<UndoNotice />
		<AccountFooter />
	</SidebarFrame>;
}
