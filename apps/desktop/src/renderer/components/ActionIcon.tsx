import { Archive, ArchiveRestore, ArrowDown, ArrowUp, ArrowUpRight, CalendarClock, Camera, ChartLine, Check, CircleCheck, CircleDot, CircleSlash, CloudUpload, Copy, createLucideIcon, Download, ExternalLink, FolderPlus, GitBranch, GitMerge, GitPullRequestArrow, GitPullRequestClosed, GitPullRequestDraft, Inbox, Link2, ListFilter, LogIn, Mail, MessageSquare, MessagesSquare, Paperclip, Pencil, PenLine, Pin, PinOff, Play, Plus, RefreshCw, RotateCcw, Search, Settings, SquareTerminal, TriangleAlert, type LucideProps } from "lucide-react";
import { cn } from "../lib/utils";

// These installed-library shapes join moving and stationary parts in one path. Split at those joins.
const OpenFolder = createLucideIcon("folder-open", [
	["path", { d: "M4 20a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2", key: "back" }],
	["path", { d: "m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4", key: "lid" }],
]);
const Unlink = createLucideIcon("unlink-2", [
	["path", { d: "M9 17H7A5 5 0 0 1 7 7h2", key: "left" }],
	["path", { d: "M15 7h2a5 5 0 0 1 0 10h-2", key: "right" }],
]);
const WordWrap = createLucideIcon("word-wrap", [
	["path", { d: "M3 6h18", key: "top" }],
	["path", { d: "M3 12h18", vectorEffect: "non-scaling-stroke", key: "middle" }],
	["path", { d: "M3 18h18", vectorEffect: "non-scaling-stroke", key: "bottom" }],
	["path", { d: "M16 12h2a3 3 0 0 1 0 6h-4m2-2-2 2 2 2", key: "return" }],
]);
const NavigationBack = createLucideIcon("navigation-back", [
	["path", { d: "m9.5 7.5-4.5 4.5 4.5 4.5", key: "head" }],
	["line", { x1: "5", y1: "12", x2: "19", y2: "12", key: "shaft" }],
]);
const NavigationForward = createLucideIcon("navigation-forward", [
	["path", { d: "m14.5 7.5 4.5 4.5-4.5 4.5", key: "head" }],
	["line", { x1: "5", y1: "12", x2: "19", y2: "12", key: "shaft" }],
]);
const SidebarLeft = createLucideIcon("sidebar-left", [
	["rect", { x: "3", y: "4", width: "18", height: "16", rx: "2.5", key: "frame" }],
	["path", { d: "M9 4H5.5A2.5 2.5 0 0 0 3 6.5v11A2.5 2.5 0 0 0 5.5 20H9Z", stroke: "none", fill: "currentColor", "data-panel-fill": "", key: "pane" }],
	["path", { d: "M9 4v16", key: "divider" }],
	["path", { d: "m16.5 9-3 3 3 3", "data-panel-chevron": "", key: "chevron" }],
]);
const SidebarRight = createLucideIcon("sidebar-right", [
	["rect", { x: "3", y: "4", width: "18", height: "16", rx: "2.5", key: "frame" }],
	["path", { d: "M15 4h3.5A2.5 2.5 0 0 1 21 6.5v11a2.5 2.5 0 0 1-2.5 2.5H15Z", stroke: "none", fill: "currentColor", "data-panel-fill": "", key: "pane" }],
	["path", { d: "M15 4v16", key: "divider" }],
	["path", { d: "m7.5 9 3 3-3 3", "data-panel-chevron": "", key: "chevron" }],
]);
const icons = { approve: Check, archive: Archive, restore: ArchiveRestore, back: NavigationBack, branch: GitBranch, camera: Camera, comment: MessageSquare, complete: CircleCheck, copy: Copy, closePullRequest: GitPullRequestClosed, down: ArrowDown, download: Download, draftPullRequest: GitPullRequestDraft, edit: PenLine, external: ExternalLink, filter: ListFilter, folder: OpenFolder, addFolder: FolderPlus, forward: NavigationForward, inbox: Inbox, issue: CircleDot, link: Link2, mail: Mail, merge: GitMerge, notPlanned: CircleSlash, open: ArrowUpRight, paperclip: Paperclip, pencil: Pencil, pin: Pin, unpin: PinOff, play: Play, plus: Plus, publish: CloudUpload, pullRequest: GitPullRequestArrow, refresh: RefreshCw, requestChanges: TriangleAlert, retry: RotateCcw, schedule: CalendarClock, search: Search, settings: Settings, sidebarLeft: SidebarLeft, sidebarRight: SidebarRight, signIn: LogIn, terminal: SquareTerminal, thread: MessagesSquare, unlink: Unlink, up: ArrowUp, usage: ChartLine, wrap: WordWrap };
export type ActionIconName = keyof typeof icons;

// Normalised lengths let a stroke trace independently of the icon's rendered size.
function normaliseStrokes(svg: SVGSVGElement | null) {
	svg?.querySelectorAll("path, circle, rect, line, polyline").forEach(part => part.setAttribute("pathLength", "1"));
}

/** Opt-in gestures for familiar actions; labels, status glyphs and window controls stay still. */
export function ActionIcon({ name, className, ...props }: { name: ActionIconName } & LucideProps) {
	const Icon = icons[name];
	return <Icon {...props} ref={normaliseStrokes} aria-hidden="true" data-icon-gesture={name} className={cn("gesture-icon", className)} />;
}
