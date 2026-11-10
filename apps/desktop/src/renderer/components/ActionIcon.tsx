import { Activity, ArrowDown, ArrowUp, ArrowUpRight, Bot, Bug, Camera, ChartLine, Check, CircleCheck, CircleDot, CircleSlash, CloudUpload, Columns3, Copy, createLucideIcon, Download, ExternalLink, Files, FileSearch, FolderPlus, GitBranch, GitBranchPlus, GitPullRequestClosed, GitPullRequestDraft, History, Keyboard, Link2, ListFilter, LogIn, Mail, MessageSquare, MessagesSquare, Monitor, Moon, Paperclip, Pause, Pencil, PenLine, Pin, PinOff, Play, Plus, RefreshCw, RotateCcw, Search, Settings, SquareCode, SquareTerminal, Sun, TextSearch, TriangleAlert, Undo2, UserRound, Globe, type LucideProps } from "lucide-react";
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
// Preserve the familiar glyphs, with a separate cursor and arc for the hover sequences.
const TypedCode = createLucideIcon("typed-code", [
	["path", { d: "m18 16 4-4-4-4", "data-code-token": "close", key: "close" }],
	["path", { d: "m6 8-4 4 4 4", "data-code-token": "open", key: "open" }],
	["path", { d: "m14.5 4-5 16", "data-code-token": "slash", key: "slash" }],
	["path", { d: "M3 8v8", strokeWidth: "1.5", "data-code-cursor": "", key: "cursor" }],
]);
const LimitsGauge = createLucideIcon("limits-gauge", [
	["path", { d: "m12 14 4-4", "data-gauge-needle": "", key: "needle" }],
	["path", { d: "M3.34 19a10 10 0 1 1 17.32 0", "data-gauge-track": "", key: "track" }],
	["path", { d: "M3.34 19a10 10 0 1 1 17.32 0", "data-gauge-fill": "", key: "fill" }],
]);
const InboxTray = createLucideIcon("inbox-tray", [
	["rect", { x: "9", y: "6", width: "6", height: "4", rx: "0.75", "data-inbox-letter": "", key: "letter" }],
	["polyline", { points: "22 12 16 12 14 15 10 15 8 12 2 12", key: "front" }],
	["path", { d: "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z", key: "frame" }],
]);
const ScheduledCalendar = createLucideIcon("scheduled-calendar", [
	["path", { d: "M16 14v2.2l1.6 1", "data-calendar-hand": "", key: "hand" }],
	["path", { d: "M16 2v4", key: "right-ring" }],
	["path", { d: "M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v4", key: "top" }],
	["path", { d: "M3 10h5", key: "rule" }],
	["path", { d: "M8 2v4", key: "left-ring" }],
	["circle", { cx: "16", cy: "16", r: "6", key: "clock" }],
	["path", { d: "M3 10v10a2 2 0 0 0 2 2h3.5", "data-calendar-page": "", key: "page" }],
]);
// A three-pixel marker stays visible when these route glyphs render at 16px.
const RoutedPullRequest = createLucideIcon("routed-pull-request", [
	["circle", { cx: "5", cy: "6", r: "3", key: "base" }],
	["path", { d: "M5 9v12", key: "stem" }],
	["circle", { cx: "19", cy: "18", r: "3", key: "branch" }],
	["path", { d: "m15 9-3-3 3-3", key: "arrow" }],
	["path", { d: "M12 6h5a2 2 0 0 1 2 2v7", "data-route-track": "", key: "route" }],
	["circle", { cx: "0", cy: "0", r: "2.25", fill: "currentColor", stroke: "none", "data-route-node": "", key: "traveller" }],
]);
const RoutedMerge = createLucideIcon("routed-merge", [
	["circle", { cx: "18", cy: "18", r: "3", key: "branch" }],
	["circle", { cx: "6", cy: "6", r: "3", key: "base" }],
	["path", { d: "M6 21V9", key: "stem" }],
	["path", { d: "M6 9a9 9 0 0 0 9 9", "data-route-track": "", key: "route" }],
	["circle", { cx: "0", cy: "0", r: "2.25", fill: "currentColor", stroke: "none", "data-route-node": "", key: "traveller" }],
]);
const ArchiveBox = createLucideIcon("archive-box", [
	["rect", { x: "2", y: "3", width: "20", height: "5", rx: "1", "data-archive-lid": "", key: "lid" }],
	["path", { d: "M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8", key: "box" }],
	["path", { d: "M10 12h4", "data-archive-symbol": "", key: "handle" }],
	["rect", { x: "9", y: "9", width: "6", height: "6", rx: "0.75", "data-archive-paper": "", key: "paper" }],
]);
const RestoreBox = createLucideIcon("restore-box", [
	["rect", { x: "2", y: "3", width: "20", height: "5", rx: "1", "data-archive-lid": "", key: "lid" }],
	["path", { d: "M4 8v11a2 2 0 0 0 2 2h2", key: "left" }],
	["path", { d: "M20 8v11a2 2 0 0 1-2 2h-2", key: "right" }],
	["path", { d: "m9 15 3-3 3 3", "data-archive-symbol": "", key: "arrow" }],
	["path", { d: "M12 12v9", "data-archive-symbol": "", key: "shaft" }],
	["rect", { x: "9", y: "9", width: "6", height: "6", rx: "0.75", "data-archive-paper": "", key: "paper" }],
]);
const WritingChat = createLucideIcon("writing-chat", [
	["path", { d: "M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7", key: "frame" }],
	["path", { d: "M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z", "data-writing-pen": "", key: "pen" }],
	["path", { d: "M7 18h5", "data-writing-line": "", key: "line" }],
]);
const icons = { account: UserRound, activity: Activity, approve: Check, archive: ArchiveBox, restore: RestoreBox, back: NavigationBack, bot: Bot, branch: GitBranch, browser: Globe, bug: Bug, camera: Camera, clone: GitBranchPlus, code: TypedCode, comment: MessageSquare, compare: Columns3, complete: CircleCheck, copy: Copy, closePullRequest: GitPullRequestClosed, down: ArrowDown, download: Download, draftPullRequest: GitPullRequestDraft, edit: PenLine, editor: SquareCode, external: ExternalLink, files: Files, fileSearch: FileSearch, filter: ListFilter, folder: OpenFolder, addFolder: FolderPlus, forward: NavigationForward, history: History, inbox: InboxTray, issue: CircleDot, keyboard: Keyboard, limits: LimitsGauge, link: Link2, mail: Mail, merge: RoutedMerge, moon: Moon, newChat: WritingChat, notPlanned: CircleSlash, open: ArrowUpRight, paperclip: Paperclip, pause: Pause, pencil: Pencil, pin: Pin, unpin: PinOff, play: Play, plus: Plus, publish: CloudUpload, pullRequest: RoutedPullRequest, refresh: RefreshCw, requestChanges: TriangleAlert, retry: RotateCcw, schedule: ScheduledCalendar, search: Search, settings: Settings, sidebarLeft: SidebarLeft, sidebarRight: SidebarRight, signIn: LogIn, sun: Sun, system: Monitor, terminal: SquareTerminal, textSearch: TextSearch, thread: MessagesSquare, undo: Undo2, unlink: Unlink, up: ArrowUp, usage: ChartLine, wrap: WordWrap };
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
