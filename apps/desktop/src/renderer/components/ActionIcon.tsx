import { Archive, ArchiveRestore, ArrowDown, ArrowUp, ArrowUpRight, CalendarClock, Camera, ChartLine, Check, CircleCheck, CircleDot, CircleSlash, CloudUpload, Copy, createLucideIcon, Download, ExternalLink, FolderPlus, GitBranch, GitMerge, GitPullRequestArrow, GitPullRequestClosed, GitPullRequestDraft, Inbox, Link2, LogIn, Mail, MessageSquare, MessagesSquare, Paperclip, Pencil, PenLine, Pin, PinOff, Plus, RefreshCw, RotateCcw, Search, Settings, SquareTerminal, TriangleAlert, type LucideProps } from "lucide-react";
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
const icons = { approve: Check, archive: Archive, restore: ArchiveRestore, branch: GitBranch, camera: Camera, comment: MessageSquare, complete: CircleCheck, copy: Copy, closePullRequest: GitPullRequestClosed, down: ArrowDown, download: Download, draftPullRequest: GitPullRequestDraft, edit: PenLine, external: ExternalLink, folder: OpenFolder, addFolder: FolderPlus, inbox: Inbox, issue: CircleDot, link: Link2, mail: Mail, merge: GitMerge, notPlanned: CircleSlash, open: ArrowUpRight, paperclip: Paperclip, pencil: Pencil, pin: Pin, unpin: PinOff, plus: Plus, publish: CloudUpload, pullRequest: GitPullRequestArrow, refresh: RefreshCw, requestChanges: TriangleAlert, retry: RotateCcw, schedule: CalendarClock, search: Search, settings: Settings, signIn: LogIn, terminal: SquareTerminal, thread: MessagesSquare, unlink: Unlink, up: ArrowUp, usage: ChartLine };
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
