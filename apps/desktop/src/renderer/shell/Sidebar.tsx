import { useMemo, useState, type ReactNode } from "react";
import { Archive, ChevronRight, Columns3, Ellipsis, FolderOpen, FolderPlus, LogIn, Pencil, Pin, PinOff, Plus, Settings } from "lucide-react";
import type { TaskOverview } from "../../shared/workspaceOverview";
import { errorText, usablePhaseoAccounts, useWorkspace, type CompareGroup } from "../app/workspace";
import { cn } from "../lib/utils";
import { shortcutLabel } from "../lib/shortcuts";
import { usePersistedState } from "../lib/persistedState";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { SettingsNav } from "../settings/SettingsPage";
import { ModelStack } from "../chat/ModelPicker";

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
	return <div role="button" tabIndex={0} aria-current={selected ? "page" : undefined} onClick={() => select(task.id)} onKeyDown={event => { if (event.key === "Enter" && !renaming) select(task.id); }}
		className={cn("group/row mx-2 flex h-8 items-center gap-2 rounded-md px-2 text-[13px] text-sidebar-foreground/85 outline-none hover:bg-sidebar-accent/70 focus-visible:ring-2 focus-visible:ring-ring/40", selected && "bg-sidebar-accent text-sidebar-foreground", indent && "pl-7")}>
		{showModel ? <span className="shrink-0"><ModelStack models={[task]} size="sm" ringClassName="ring-transparent" /></span> : <StatusDot task={task} />}
		{renaming
			? <input autoFocus defaultValue={task.title} maxLength={200} aria-label="Chat title" onClick={event => event.stopPropagation()} className="h-6 min-w-0 flex-1 rounded border border-ring bg-background px-1.5 text-[13px] outline-none"
				onBlur={event => { const title = event.target.value.trim(); setRenaming(false); if (title && title !== task.title) void command({ type: "update-task", id: task.id, title }); }}
				onKeyDown={event => { event.stopPropagation(); if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") setRenaming(false); }} />
			: <span className="min-w-0 flex-1 truncate">{task.title}</span>}
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
	const chats = overview.tasks.filter(task => !task.projectId && !task.parentId && !task.archived && !grouped.has(task.id));
	const pinned = chats.filter(task => task.pinned);
	type Item = { kind: "task"; task: TaskOverview; at: string } | { kind: "compare"; group: CompareGroup; at: string };
	const items: Item[] = [
		...chats.filter(task => !task.pinned).map(task => ({ kind: "task" as const, task, at: task.updatedAt })),
		...compareGroups.map(group => ({ kind: "compare" as const, group, at: group.taskIds.map(id => overview.tasks.find(task => task.id === id)?.updatedAt ?? group.createdAt).sort().at(-1)! })),
	].sort((a, b) => b.at.localeCompare(a.at));
	const buckets = new Map<string, Item[]>();
	for (const item of items) { const key = dateBucket(item.at); buckets.set(key, [...buckets.get(key) ?? [], item]); }
	if (!chats.length && !compareGroups.length) return <p className="px-4 py-6 text-center text-xs text-muted-foreground">Your chats will appear here.</p>;
	return <>
		{pinned.length > 0 && <><SectionLabel>Pinned</SectionLabel>{pinned.map(task => <ChatRow key={task.id} task={task} showModel showTime={false} />)}</>}
		{[...buckets].map(([label, values]) => <div key={label}>
			<SectionLabel>{label}</SectionLabel>
			{values.map(item => item.kind === "task" ? <ChatRow key={item.task.id} task={item.task} showModel showTime={false} /> : <CompareRow key={item.group.id} group={item.group} />)}
		</div>)}
	</>;
}

function ProjectList() {
	const { overview, api, setOverview, setError, select, setNewChatProjectId } = useWorkspace();
	const [closed, setClosed] = usePersistedState<Record<string, boolean>>("phaseo.desktop.closedProjects", {});
	const projects = overview.projects.filter(project => !project.worktree?.removedAt);
	const addProject = () => { if (api) void api.chooseProject().then(setOverview, reason => setError(errorText(reason))); };
	return <>
		<SectionLabel action={<button type="button" aria-label="Add project" title="Add project" onClick={addProject} className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-foreground [&_svg]:size-3.5"><FolderPlus /></button>}>Projects</SectionLabel>
		{!projects.length && <div className="px-4 pt-1 pb-3">
			<p className="text-xs text-muted-foreground">Open a folder to start coding with an agent.</p>
			<button type="button" onClick={addProject} className="mt-3 inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/85"><FolderOpen className="size-3.5" />Open folder</button>
		</div>}
		{projects.map(project => {
			const tasks = overview.tasks.filter(task => task.projectId === project.id && !task.parentId && !task.archived).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
			const open = !closed[project.id];
			return <div key={project.id} className="mb-1">
				<div className="group/project mx-2 flex h-8 items-center gap-1.5 rounded-md px-1.5 text-[13px] font-semibold hover:bg-sidebar-accent/60">
					<button type="button" aria-expanded={open} onClick={() => setClosed(current => ({ ...current, [project.id]: open }))} className="flex min-w-0 flex-1 items-center gap-1.5">
						<ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
						<FolderOpen className="size-4 shrink-0 text-muted-foreground" />
						<span className="truncate">{project.name}</span>
						{project.worktree && <span className="truncate font-mono text-[10.5px] font-normal text-muted-foreground">⎇ {project.worktree.branch}</span>}
					</button>
					<button type="button" aria-label={`New chat in ${project.name}`} title="New chat" onClick={() => { setNewChatProjectId(project.id); select(undefined); }} className="grid size-5 place-items-center rounded text-muted-foreground opacity-0 group-hover/project:opacity-100 hover:bg-background/70 hover:text-foreground [&_svg]:size-3.5"><Plus /></button>
				</div>
				{open && tasks.map(task => <ChatRow key={task.id} task={task} indent />)}
				{open && !tasks.length && <p className="py-1 pr-3 pl-10 text-xs text-muted-foreground">No chats yet</p>}
			</div>;
		})}
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

export function Sidebar() {
	const { mode, select, selectedId, compareId, setNewChatProjectId, settings } = useWorkspace();
	const fresh = !selectedId && !compareId;
	if (settings) return <aside aria-label="Settings" className="flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground"><SettingsNav /></aside>;
	return <aside aria-label={mode === "chat" ? "Chats" : "Projects"} className="flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
		<div className="p-2.5">
			<button type="button" onClick={() => { if (mode === "chat") setNewChatProjectId(""); select(undefined); }}
				className={cn("flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-[13px] font-semibold transition-colors", fresh ? "bg-sidebar-accent text-foreground" : "bg-primary text-primary-foreground hover:bg-primary/85")}>
				<Plus className="size-4" />New chat<span className={cn("ml-auto text-[10.5px] font-medium", fresh ? "text-muted-foreground" : "text-primary-foreground/70")}>{shortcutLabel("N")}</span>
			</button>
		</div>
		<nav className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pb-3">{mode === "chat" ? <ChatList /> : <ProjectList />}</nav>
		<AccountFooter />
	</aside>;
}
