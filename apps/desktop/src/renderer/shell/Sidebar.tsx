import { formatAgoShort, formatDateParts } from "@phaseo/app-kit/format";
import { useNow } from "../lib/useNow";
import { prefetchTask } from "../lib/useSelectedTask";
import { useMemo, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { JumpHint, publishSidebarOrder, useJumpHints } from "../lib/sidebarOrder";
import { Archive, ArchiveRestore, CalendarClock, Copy, Mail, Trash2, ChartLine, Inbox, Columns3, GitPullRequestArrow, Ellipsis, ExternalLink, LogIn, WandSparkles, Pencil, Pin, PinOff, Plus, Settings, Gauge, UserRound } from "lucide-react";
import { ScrollArea } from "../components/ui/scroll-area";
import { chatDragType } from "../../shared/mentions";
import type { TaskOverview } from "../../shared/workspaceOverview";
import { inboxLists } from "../../shared/inbox";
import { usablePhaseoAccounts, useWorkspace, type CompareGroup } from "../app/workspace";
import { cn } from "../lib/utils";
import { shortcut } from "../lib/keybindings";
import { usePersistedState } from "../lib/persistedState";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { Tip } from "../components/ui/tooltip";
import { SettingsNav } from "../settings/SettingsPage";
import { ModelStack } from "../chat/ModelPicker";
import { useScheduledTasks } from "../views/ScheduledTasks";
import { CodeThreadList } from "./CodeThreadList";
import { FactorySidebar } from "../factory/FactoryPage";
import { UsageRings } from "./UsageRings";
import { deleteWithUndo, dismissUndo, offerUndo, runUndo, undoLabel, usePendingDeletes, useThreadUndo } from "./threadUndo";
import { isUnread } from "../../shared/threadLifecycle";
import { ArchivedChatsDialog, archivedChats, openArchivedChats } from "./ArchivedChats";
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
	return formatDateParts(time, now.getFullYear() === new Date(time).getFullYear() ? { month: "long" } : { month: "long", year: "numeric" });
}

/** "5m", "3h", "2d" (the website's relative units, abbreviated), then the date once it is a week old. */
function relative(iso: string) {
	const at = Date.parse(iso);
	return Date.now() - at < 7 * dayMs ? formatAgoShort(at) : formatDateParts(iso, { month: "short", day: "numeric" });
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

/** Chat mode's row menu, with Code's undo: leaving the open chat (archive, delete, mark unread) opens a new chat. */
function RowMenu({ task, onRename }: { task: TaskOverview; onRename: () => void }) {
	const { command, selectedId, select } = useWorkspace();
	const leave = () => { if (task.id === selectedId) select(undefined); };
	const working = task.status === "running" || task.status === "waiting";
	const pin = async () => { if (await command({ type: "update-task", id: task.id, pinned: !task.pinned }) && task.pinned) offerUndo("Unpinned", () => command({ type: "update-task", id: task.id, pinned: true })); };
	const archive = async () => { leave(); if (await command({ type: "update-task", id: task.id, archived: true })) offerUndo("Archived", () => command({ type: "update-task", id: task.id, archived: false })); };
	return <DropdownMenu>
		<DropdownMenuTrigger render={<button type="button" aria-label={`Actions for ${task.title}`} onClick={event => event.stopPropagation()} className="hidden size-5 shrink-0 place-items-center rounded text-muted-foreground group-hover/row:grid group-has-[:focus-visible]/row:grid hover:bg-background/70 hover:text-foreground data-popup-open:grid [&_svg]:size-3.5" />}><Ellipsis /></DropdownMenuTrigger>
		<DropdownMenuContent align="start" className="w-44">
			<DropdownMenuItem onClick={onRename}><Pencil />Rename</DropdownMenuItem>
			<DropdownMenuItem onClick={() => void command({ type: "regenerate-title", id: task.id })}><WandSparkles />Regenerate title</DropdownMenuItem>
			<DropdownMenuItem onClick={() => void pin()}>{task.pinned ? <PinOff /> : <Pin />}{task.pinned ? "Unpin" : "Pin"}</DropdownMenuItem>
			<TagMenu task={task} />
			<DropdownMenuItem disabled={!task.lastCompletedAt || isUnread(task)} onClick={() => { leave(); void command({ type: "mark-unread", id: task.id }); }}><Mail />Mark unread</DropdownMenuItem>
			<DropdownMenuItem onClick={() => void navigator.clipboard.writeText(task.id)}><Copy />Copy chat ID</DropdownMenuItem>
			<DropdownMenuSeparator />
			{task.archived ? <DropdownMenuItem onClick={() => void command({ type: "update-task", id: task.id, archived: false })}><ArchiveRestore />Restore</DropdownMenuItem>
				: <DropdownMenuItem disabled={working} onClick={() => void archive()}><Archive />Archive</DropdownMenuItem>}
			<DropdownMenuItem variant="destructive" disabled={working} onClick={() => { leave(); deleteWithUndo(task.id, () => command({ type: "delete-task", id: task.id })); }}><Trash2 />Delete</DropdownMenuItem>
		</DropdownMenuContent>
	</DropdownMenu>;
}

function ChatRow({ task, indent, showModel, showTime = true, hint }: { task: TaskOverview; indent?: boolean; showModel?: boolean; showTime?: boolean; hint?: number }) {
	const { selectedId, select, command } = useWorkspace();
	const [renaming, setRenaming] = useState(false);
	const selected = task.id === selectedId;
	const busy = task.status === "running" || task.status === "waiting" || !!task.approvalsCount || !!task.answersCount;
	// A finished turn not seen yet, as Code's rows show it.
	const unread = !busy && isUnread(task);
	// Dragging a chat into a composer mentions it there.
	return <div role="button" tabIndex={0} aria-current={selected ? "page" : undefined} onPointerEnter={() => prefetchTask(task.id)} onClick={() => select(task.id)} onKeyDown={event => { if (event.key === "Enter" && !renaming) select(task.id); }}
		draggable={!renaming} onDragStart={event => { event.dataTransfer.setData(chatDragType, JSON.stringify({ id: task.id, title: task.title })); event.dataTransfer.setData("text/plain", task.title); event.dataTransfer.effectAllowed = "copy"; }}
		className={cn("group/row mx-2 flex h-8 items-center gap-2 rounded-md px-2 text-[13px] text-sidebar-foreground/85 outline-none hover:bg-sidebar-accent/70 focus-visible:ring-2 focus-visible:ring-ring/40", selected && "bg-sidebar-accent text-sidebar-foreground", indent && "pl-7")}>
		{showModel ? <span className="shrink-0"><ModelStack models={[task]} size="sm" ringClassName="ring-transparent" /></span> : <StatusDot task={task} />}
		{renaming
			? <input autoFocus defaultValue={task.title} maxLength={200} aria-label="Chat title" onClick={event => event.stopPropagation()} className="h-6 min-w-0 flex-1 rounded border border-ring bg-background px-1.5 text-[13px] outline-none"
				onBlur={event => { const title = event.target.value.trim(); setRenaming(false); if (title && title !== task.title) void command({ type: "update-task", id: task.id, title }); }}
				onKeyDown={event => { event.stopPropagation(); if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") setRenaming(false); }} />
			: <span className={cn("min-w-0 flex-1 truncate", unread && "font-semibold text-sidebar-foreground")}>{task.title}</span>}
		{!renaming && <TagDots tags={task.tags} />}
		{showModel && busy && <StatusDot task={task} />}
		{unread && !renaming && <span role="img" aria-label="Unread" title="Unread" className="size-1.5 shrink-0 rounded-[2px] bg-primary" />}
		{showTime && !renaming && <span className="text-[11px] text-muted-foreground group-hover/row:hidden">{relative(task.updatedAt)}</span>}
		{hint !== undefined ? <JumpHint index={hint} /> : !renaming && <RowMenu task={task} onRename={() => setRenaming(true)} />}
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
			<DropdownMenuTrigger render={<button type="button" aria-label={`Actions for ${group.title}`} onClick={event => event.stopPropagation()} className="hidden size-5 shrink-0 place-items-center rounded text-muted-foreground group-hover/row:grid group-has-[:focus-visible]/row:grid hover:bg-background/70 data-popup-open:grid [&_svg]:size-3.5" />}><Ellipsis /></DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-44"><DropdownMenuItem onClick={() => removeCompareGroup(group.id)}><Archive />Ungroup</DropdownMenuItem></DropdownMenuContent>
		</DropdownMenu>
	</div>;
}

/** Only the rows in view are mounted: a year of chats is thousands of rows, each with its own menu and tooltips. */
function ChatList({ viewport }: { viewport: HTMLDivElement | null }) {
	const { overview, compareGroups } = useWorkspace();
	const hidden = usePendingDeletes();
	const grouped = useMemo(() => new Set(compareGroups.flatMap(group => group.taskIds)), [compareGroups]);
	const all = overview.tasks.filter(task => !task.projectId && !task.delegation?.parentTaskId && !task.archived && !grouped.has(task.id) && !hidden.has(task.id));
	const archived = useMemo(() => archivedChats(overview.tasks.filter(task => !task.projectId), hidden).length, [overview.tasks, hidden]);
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
	const now = new Date();
	for (const item of items) { const key = dateBucket(item.at, now), bucket = buckets.get(key); if (bucket) bucket.push(item); else buckets.set(key, [item]); }
	const ordered = [...pinned.map(task => task.id), ...[...buckets.values()].flat().flatMap(item => item.kind === "task" ? [item.task.id] : [])];
	publishSidebarOrder(ordered);
	const hints = useJumpHints();
	const hint = (id: string) => { if (!hints) return undefined; const index = ordered.indexOf(id); return index >= 0 && index < 9 ? index + 1 : undefined; };
	type Entry = { key: string; size: number; node: ReactNode };
	const entries: Entry[] = [];
	if (tags.length > 0) entries.push({ key: "tags", size: 34, node: <div role="group" aria-label="Filter chats by tag" className="flex flex-wrap gap-1 px-3 pt-2 pb-1">
		{tags.slice(0, 12).map(tag => <TagChip key={tag} tag={tag} active={tag === active} onClick={() => setFilter(tag === active ? "" : tag)} className="h-5.5 px-1.5 text-[11px]" />)}
	</div> });
	if (active && !chats.length) entries.push({ key: "no-tagged", size: 48, node: <p className="px-4 py-4 text-xs text-muted-foreground">No open chats tagged {active}.</p> });
	if (pinned.length > 0) { entries.push({ key: "label:Pinned", size: 32, node: <SectionLabel>Pinned</SectionLabel> }); for (const task of pinned) entries.push({ key: task.id, size: 32, node: <ChatRow task={task} showModel showTime={false} hint={hint(task.id)} /> }); }
	for (const [label, values] of buckets) {
		entries.push({ key: `label:${label}`, size: 32, node: <SectionLabel>{label}</SectionLabel> });
		for (const item of values) entries.push(item.kind === "task" ? { key: item.task.id, size: 32, node: <ChatRow task={item.task} showModel showTime={false} hint={hint(item.task.id)} /> } : { key: item.group.id, size: 32, node: <CompareRow group={item.group} /> });
	}
	if (archived > 0) entries.push({ key: "archived", size: 40, node: <button type="button" onClick={() => openArchivedChats()} className="mx-2 mt-2 flex h-8 w-[calc(100%-1rem)] items-center gap-2 rounded-md px-2 text-[12.5px] text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground"><Archive className="size-3.5" />Archived chats<span className="ml-auto text-[11px] tabular-nums">{archived}</span></button> });
	const virtualizer = useVirtualizer({ count: entries.length, getScrollElement: () => viewport, estimateSize: index => entries[index].size, getItemKey: index => entries[index].key, overscan: 16 });
	if (!all.length && !compareGroups.length && !archived) return <p className="px-4 py-6 text-center text-xs text-muted-foreground">Your chats will appear here.</p>;
	// The row count is published because only the rows in view exist in the page.
	return <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }} data-chat-count={pinned.length + items.length}>
		{virtualizer.getVirtualItems().map(item => <div key={item.key} data-index={item.index} ref={virtualizer.measureElement} className="absolute top-0 left-0 w-full" style={{ transform: `translateY(${item.start}px)` }}>{entries[item.index].node}</div>)}
	</div>;
}

/** A page button in the footer: an icon with a tooltip, marked while its page is open. */
function FooterButton({ name, tip, active, onClick, children }: { name: string; tip?: string; active?: boolean; onClick: () => void; children: ReactNode }) {
	return <Tip label={tip ?? name}><button type="button" aria-label={name} aria-current={active ? "page" : undefined} onClick={onClick}
		className={cn("relative grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 [&_svg]:size-4", active && "bg-sidebar-accent text-foreground")}>{children}</button></Tip>;
}

/** The profile picture when there is one and it loads, otherwise initials. */
function Avatar({ name, picture, className }: { name: string; picture?: string; className?: string }) {
	const [failed, setFailed] = useState<string>();
	if (picture && failed !== picture) return <img aria-hidden alt="" src={picture} referrerPolicy="no-referrer" onError={() => setFailed(picture)} className={cn("shrink-0 rounded-md object-cover", className)} />;
	const initials = name.split(/[\s._@-]+/).filter(Boolean).slice(0, 2).map(word => word[0]).join("") || name.slice(0, 2);
	return <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-md bg-linear-to-br from-[#0078b8] to-[#7c3aed] font-bold text-white", className)}>{initials.toUpperCase()}</span>;
}

/**
 * The sidebar's footer: the limit rings, then the profile as an avatar (its menu has the account and settings) and the
 * pages that don't need a full row: Usage, Scheduled tasks, Settings.
 */
function AccountFooter() {
	const { overview, openSettings, settings, usagePage, openUsage, scheduled, openScheduled } = useWorkspace();
	const { tasks } = useScheduledTasks();
	const on = tasks.filter(task => task.enabled).length;
	const account = usablePhaseoAccounts(overview)[0];
	// Who signed in, from their Phaseo profile; the account's own name until it has been read. The menu greets them by first name.
	const name = account?.profile?.name ?? account?.profile?.email?.split("@")[0] ?? account?.name ?? "", picture = account?.profile?.picture;
	const firstName = account?.profile?.givenName ?? account?.profile?.name?.split(/s+/)[0] ?? name;
	return <div className="sidebar-footer border-t border-sidebar-border"><UsageRings /><div className="flex items-center gap-1 p-2.5">
		{account
			? <DropdownMenu>
				<DropdownMenuTrigger render={<button type="button" aria-label={`Profile: ${name}, signed in to Phaseo`} className="grid size-7 shrink-0 place-items-center rounded-md outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-sidebar-accent" />}>
					<Avatar name={name} picture={picture} className="size-6 text-[10px]" />
				</DropdownMenuTrigger>
				<DropdownMenuContent side="top" align="start" className="w-56">
					<div className="flex items-center gap-2.5 px-2 py-1.5">
						<Avatar name={name} picture={picture} className="size-7 text-[11px]" />
						<span className="min-w-0"><span className="block truncate text-[12.5px] font-semibold">{firstName}</span><span className="block truncate text-[11px] text-muted-foreground">{account.profile?.email ?? "Signed in to Phaseo"}</span></span>
					</div>
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={() => void window.phaseoDesktop?.openExternal("https://phaseo.app/settings/account")}><ExternalLink />Manage account</DropdownMenuItem>
					<DropdownMenuItem onClick={() => openSettings("accounts")}><UserRound />Accounts</DropdownMenuItem>
					<DropdownMenuItem onClick={() => openUsage("limits")}><Gauge />Usage limits</DropdownMenuItem>
					<DropdownMenuItem onClick={() => openSettings()}><Settings />Settings<DropdownMenuShortcut>{shortcut("settings.open")}</DropdownMenuShortcut></DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			: <button type="button" onClick={() => openSettings("accounts")} className="flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[12.5px] font-semibold text-primary hover:bg-sidebar-accent/70"><LogIn className="size-4" />Sign in</button>}
		<span className="flex-1" />
		<FooterButton name="Usage" tip="Usage: cost, tokens and limits" active={usagePage} onClick={() => openUsage()}><ChartLine /></FooterButton>
		<FooterButton name="Scheduled tasks" tip={on ? `Scheduled tasks · ${on} on` : "Scheduled tasks"} active={scheduled} onClick={openScheduled}>
			<CalendarClock />{on > 0 && <span aria-hidden className="absolute top-1 right-1 size-1.5 rounded-[2px] bg-primary" />}
		</FooterButton>
		<FooterButton name="Settings" tip={`Settings (${shortcut("settings.open")})`} active={Boolean(settings)} onClick={() => openSettings()}><Settings /></FooterButton>
	</div></div>;
}

/** T3's undo notice: the last settle, snooze, unpin or archive, for five seconds. */
function UndoNotice() {
	const action = useThreadUndo();
	if (!action) return null;
	return <div role="status" className="mx-2.5 mb-2 flex items-center gap-2 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-sm">
		<span className="min-w-0 flex-1 truncate">{undoLabel(action)}</span>
		<button type="button" onClick={() => runUndo()} className="font-semibold text-primary hover:underline">Undo <span className="font-normal text-muted-foreground">{shortcut("thread.undo")}</span></button>
		<button type="button" aria-label="Dismiss" onClick={dismissUndo} className="text-muted-foreground hover:text-foreground">×</button>
	</div>;
}

/** The Inbox, in both modes: it lists what needs the person across every chat and agent, with how many. */
function InboxLink() {
	const { inboxPage, openInbox, overview } = useWorkspace();
	// Ticks so a turn that goes silent counts without new data.
	const now = useNow();
	const count = useMemo(() => inboxLists(overview.tasks, now).needsYou.length, [overview.tasks, now]);
	return <button type="button" aria-current={inboxPage ? "page" : undefined} onClick={openInbox}
		className={cn("mt-1 flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-[13px] text-sidebar-foreground/85 hover:bg-sidebar-accent/70", inboxPage && "bg-sidebar-accent text-sidebar-foreground")}>
		<Inbox className="size-4 text-muted-foreground" />Inbox
		{count > 0 && <span className="ml-auto text-[11px] font-semibold text-warning" title={`${count} waiting on you`}>{count}</span>}
	</button>;
}

/** T3 puts Pull requests among the sidebar's page links. Chat mode has no projects, so only Code shows it. */
function PullRequestsLink() {
	const { pullRequestsPage, openPullRequests } = useWorkspace();
	return <button type="button" aria-current={pullRequestsPage ? "page" : undefined} onClick={openPullRequests}
		className={cn("flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-[13px] text-sidebar-foreground/85 hover:bg-sidebar-accent/70", pullRequestsPage && "bg-sidebar-accent text-sidebar-foreground")}>
		<GitPullRequestArrow className="size-4 text-muted-foreground" />Pull requests
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
			className={cn("absolute inset-y-0 -right-1.5 z-20 w-3 cursor-col-resize outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:transition-colors hover:after:bg-ring/60 focus-visible:after:bg-ring", dragging && "after:bg-ring")} />
		{dragging && <div className="fixed inset-0 z-50 cursor-col-resize" />}
	</aside>;
}

export function Sidebar() {
	const { mode, codeView, factoryRoute, openFactory, select, selectedId, compareId, setNewChatProjectId, settings, scheduled, pullRequestsPage, inboxPage } = useWorkspace();
	const factory = mode === "code" && codeView === "factory";
	const writing = factory && factoryRoute.page === "new" && !inboxPage;
	const [chatViewport, setChatViewport] = useState<HTMLDivElement | null>(null);
	const fresh = !factory && !selectedId && !compareId && !scheduled && !pullRequestsPage && !inboxPage;
	if (settings) return <SidebarFrame label="Settings"><SettingsNav /></SidebarFrame>;
	return <SidebarFrame label={mode === "chat" ? "Chats" : factory ? "Factory" : "Projects"}>
		<div className="p-2.5">
			{factory ? <button type="button" onClick={() => openFactory({ page: "new" })}
				className={cn("flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-[13px] font-semibold transition-colors", writing ? "bg-sidebar-accent text-foreground" : "bg-primary text-primary-foreground hover:bg-primary/85")}>
				<Plus className="size-4" />New issue
			</button> : <button type="button" onClick={() => { if (mode === "chat") setNewChatProjectId(""); select(undefined); }}
				className={cn("flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-[13px] font-semibold transition-colors", fresh ? "bg-sidebar-accent text-foreground" : "bg-primary text-primary-foreground hover:bg-primary/85")}>
				<Plus className="size-4" />New chat<span className={cn("ml-auto text-[10.5px] font-medium", fresh ? "text-muted-foreground" : "text-primary-foreground/70")}>{shortcut("chat.new")}</span>
			</button>}
			<InboxLink />
			{mode === "code" && !factory && <PullRequestsLink />}
		</div>
		{factory
			? <FactorySidebar />
			: mode === "chat"
			? <ScrollArea className="min-h-0 flex-1" viewportRef={setChatViewport}><nav className="pb-3"><ChatList viewport={chatViewport} /></nav></ScrollArea>
			: <ScrollArea className="min-h-0 flex-1" viewportClassName="[&>div]:min-h-full [&>div]:flex [&>div]:flex-col"><nav aria-label="Code chats" className="flex flex-1 flex-col"><CodeThreadList /></nav></ScrollArea>}
		<UndoNotice />
		<ArchivedChatsDialog />
		<AccountFooter />
	</SidebarFrame>;
}
