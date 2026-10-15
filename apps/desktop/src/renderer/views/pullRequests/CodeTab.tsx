import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, Columns2, File, Folder, FolderTree, MessageSquareReply, Pilcrow, Rows3, TextWrap } from "lucide-react";
import type { DiffLineAnnotation } from "@pierre/diffs";
import type { PullRequestFile } from "../../../shared/pullRequestFiles";
import type { PullRequestAction, PullRequestReviewThreadView, PullRequestView } from "../../../shared/pullRequestView";
import { DiffView } from "../../components/DiffView";
import type { DiffLayout } from "../../components/diffRendering";
import { MessageContent } from "../../components/MessageContent";
import { Button } from "../../components/ui/button";
import { ScrollArea } from "../../components/ui/scroll-area";
import { Textarea } from "../../components/ui/textarea";
import { Toggle } from "../../components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import { pullRequestPatch } from "../../lib/pullRequestPatch";
import { usePersistedState } from "../../lib/persistedState";
import { cn } from "../../lib/utils";
import { ActorLabel, DiffStat, errorMessage, MetaLine, Tip } from "./presentation";
import { fileTree, ignoreWhitespacePatch, readViewed, relativeTime, setViewed, viewedState, viewedStorageKey, type FileTreeNode, type ViewedFiles } from "./pullRequestLogic";
import { Reactions } from "./SummaryTab";

const statusLetter: Record<string, { letter: string; tone: string }> = { added: { letter: "A", tone: "text-emerald-600 dark:text-emerald-400" }, removed: { letter: "D", tone: "text-red-600 dark:text-red-400" }, renamed: { letter: "R", tone: "text-sky-600 dark:text-sky-400" }, copied: { letter: "C", tone: "text-sky-600 dark:text-sky-400" } };
const fileAnchor = (path: string) => `pr-file-${encodeURIComponent(path)}`;

function ToolbarToggle({ label, pressed, onPressedChange, children }: { label: string; pressed: boolean; onPressedChange: (pressed: boolean) => void; children: React.ReactNode }) {
	return <Tip label={label}><Toggle aria-label={label} size="sm" pressed={pressed} onPressedChange={onPressedChange} className="size-7 min-w-7 px-0 text-muted-foreground data-[pressed]:bg-accent data-[pressed]:text-foreground [&_svg]:size-3.5">{children}</Toggle></Tip>;
}

/** One inline review thread: flat comments, a reply box and Resolve or Unresolve. */
export function ReviewThread({ thread, projectId, pending, onAction }: { thread: PullRequestReviewThreadView; projectId: string; pending: boolean; onAction: (action: PullRequestAction) => Promise<boolean> }) {
	const [replying, setReplying] = useState(false), [draft, setDraft] = useState(""), [error, setError] = useState("");
	const [open, setOpen] = useState(!thread.resolved);
	const act = async (action: PullRequestAction) => { setError(""); try { const done = await onAction(action); if (done && action.type === "reply") { setDraft(""); setReplying(false); } } catch (reason) { setError(errorMessage(reason)); } };
	return <div className="border-y border-border/60 bg-background px-3 py-2 font-sans text-xs whitespace-normal" data-thread-id={thread.id}>
		<div className="flex items-center gap-2">
			<button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-muted-foreground hover:text-foreground" aria-expanded={open} onClick={() => setOpen(!open)}>
				<ChevronRight aria-hidden className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")} />
				<span className="truncate">{thread.totalComments} {thread.totalComments === 1 ? "comment" : "comments"}{thread.resolved ? " · Resolved" : ""}{thread.outdated ? " · Outdated" : ""}</span>
			</button>
			{(thread.resolved ? thread.canUnresolve : thread.canResolve) && <Button size="xs" variant="ghost" disabled={pending} onClick={() => void act({ type: "resolve", threadId: thread.id, resolved: !thread.resolved })}>{thread.resolved ? "Unresolve" : "Resolve"}</Button>}
		</div>
		{open && <div className="mt-2 space-y-3">
			{thread.comments.map(comment => <div key={comment.id} className="border-l-2 border-border/60 pl-3">
				<div className="flex items-center gap-2"><MetaLine className="min-w-0 flex-1 text-muted-foreground"><ActorLabel actor={comment.author} /><span>{relativeTime(comment.createdAt)}</span></MetaLine><Reactions reactions={comment.reactions} /></div>
				<div className="pr-comment-body mt-1 min-w-0"><MessageContent text={comment.body} projectId={projectId} /></div>
			</div>)}
			{thread.totalComments > thread.comments.length && <p className="text-muted-foreground">{thread.totalComments - thread.comments.length} more on GitHub.</p>}
			{thread.canReply && (replying
				? <div className="space-y-2"><Textarea autoFocus value={draft} disabled={pending} onChange={event => setDraft(event.target.value)} placeholder="Reply…" aria-label="Reply to this thread" className="min-h-14 text-xs" onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setReplying(false); } }} />
					<div className="flex justify-end gap-2"><Button size="xs" variant="ghost" disabled={pending} onClick={() => setReplying(false)}>Cancel</Button><Button size="xs" disabled={pending || !draft.trim()} onClick={() => void act({ type: "reply", threadId: thread.id, body: draft })}>{pending ? "Posting…" : "Reply"}</Button></div></div>
				: <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => setReplying(true)}><MessageSquareReply className="size-3.5" />Reply</Button>)}
			{error && <p role="alert" className="text-destructive">{error}</p>}
		</div>}
	</div>;
}

function TreeRows({ nodes, depth, onSelect, viewed }: { nodes: FileTreeNode[]; depth: number; onSelect: (path: string) => void; viewed: (path: string) => boolean }) {
	return <>{nodes.map(node => <div key={node.path}>
		<button type="button" onClick={() => node.file && onSelect(node.path)} disabled={!node.file} style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }} className={cn("flex h-6 w-full min-w-0 items-center gap-1.5 rounded-md pr-2 text-left text-xs", node.file ? "text-foreground hover:bg-accent/60" : "text-muted-foreground", node.file && viewed(node.path) && "text-muted-foreground line-through decoration-muted-foreground/40")}>
			{node.file ? <File aria-hidden className="size-3.5 shrink-0 opacity-60" /> : <Folder aria-hidden className="size-3.5 shrink-0 opacity-60" />}<span className="truncate">{node.name}</span>
		</button>
		{!node.file && <TreeRows nodes={node.children} depth={depth + 1} onSelect={onSelect} viewed={viewed} />}
	</div>)}</>;
}

/** Every changed file as its own diff, with T3's toolbar, Viewed ticks kept on this machine and inline review threads. */
export function CodeTab({ view, projectId, pending, onAction, onOpen }: { view: PullRequestView; projectId: string; pending: boolean; onAction: (action: PullRequestAction) => Promise<boolean>; onOpen: (url: string) => void }) {
	const api = window.phaseoDesktop?.workspace;
	const [files, setFiles] = useState<PullRequestFile[]>([]), [page, setPage] = useState(0), [hasNext, setHasNext] = useState(false), [total, setTotal] = useState(view.changedFiles);
	const [loading, setLoading] = useState(true), [error, setError] = useState("");
	const [layout, setLayout] = usePersistedState<DiffLayout>("phaseo.desktop.pullRequestDiffLayout", "unified");
	const [wrap, setWrap] = usePersistedState("phaseo.desktop.pullRequestDiffWrap", true);
	const [ignoreWhitespace, setIgnoreWhitespace] = usePersistedState("phaseo.desktop.pullRequestIgnoreWhitespace", false);
	const [treeOpen, setTreeOpen] = usePersistedState("phaseo.desktop.pullRequestFileTree", false);
	const storageKey = viewedStorageKey(view.repository, view.number);
	const [viewed, setViewedFiles] = useState<ViewedFiles>(() => readViewed(localStorage, storageKey));
	const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
	const scroller = useRef<HTMLDivElement>(null);
	const revision = `${view.headOid}:${view.baseOid}`;
	const load = useCallback(async (next: number, replace: boolean) => {
		if (!api) { setLoading(false); setError("Open the desktop app to load changed files."); return; }
		setLoading(true); setError("");
		try {
			const result = await api.pullRequestFiles(projectId, { number: view.number, page: next, headOid: view.headOid, baseOid: view.baseOid });
			setFiles(current => replace ? result.files : [...current, ...result.files.filter(file => !current.some(other => other.filename === file.filename))]);
			setPage(result.page); setHasNext(result.hasNext); setTotal(result.total);
		} catch (reason) { setError(errorMessage(reason)); }
		finally { setLoading(false); }
	}, [api, projectId, view.number, view.headOid, view.baseOid]);
	// Reload only when the reviewed revision changes, not on every new view object.
	useEffect(() => { void load(1, true); }, [revision, load]);
	useEffect(() => { setViewedFiles(readViewed(localStorage, storageKey)); }, [storageKey]);
	const markViewed = (file: PullRequestFile, next: boolean) => {
		const updated = setViewed(viewed, file.filename, file.blobOid, next);
		setViewedFiles(updated);
		try { localStorage.setItem(storageKey, JSON.stringify(updated)); } catch { /* Ticks stay for this session. */ }
		// Ticking a file folds it away, as T3 Code does; unticking opens it again.
		setCollapsed(current => ({ ...current, [file.filename]: next }));
	};
	const isCollapsed = (file: PullRequestFile) => collapsed[file.filename] ?? viewedState(viewed, file.filename, file.blobOid) === "viewed";
	const viewedCount = files.filter(file => viewedState(viewed, file.filename, file.blobOid) === "viewed").length;
	const allCollapsed = files.length > 0 && files.every(isCollapsed);
	const tree = useMemo(() => fileTree(files.map(file => file.filename)), [files]);
	const threadsByPath = useMemo(() => { const map = new Map<string, PullRequestReviewThreadView[]>(); for (const thread of view.threads) map.set(thread.path, [...(map.get(thread.path) ?? []), thread]); return map; }, [view.threads]);
	const select = (path: string) => { setCollapsed(current => ({ ...current, [path]: false })); requestAnimationFrame(() => document.getElementById(fileAnchor(path))?.scrollIntoView({ block: "start" })); };

	const toolbar = <div className="flex h-10 min-h-10 shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-background px-4 text-xs text-muted-foreground">
		<MetaLine className="min-w-0 flex-1"><span className="shrink-0 tabular-nums">{total} {total === 1 ? "file" : "files"}</span>{files.length > 0 && <span className="truncate tabular-nums">{viewedCount} / {files.length} viewed</span>}</MetaLine>
		<div className="flex shrink-0 items-center gap-1">
			<ToolbarToggle label={ignoreWhitespace ? "Show whitespace changes" : "Hide whitespace changes"} pressed={ignoreWhitespace} onPressedChange={setIgnoreWhitespace}><Pilcrow /></ToolbarToggle>
			<ToggleGroup aria-label="Diff layout" value={layout} onValueChange={(value: string) => { if (value === "unified" || value === "split") setLayout(value); }} spacing={0.5} className="rounded-md bg-muted/70 p-0.5">
				<ToggleGroupItem value="unified" aria-label="Unified diff view" className="h-6 min-w-6 rounded-[5px] px-1.5 text-muted-foreground data-[pressed]:bg-background data-[pressed]:text-foreground data-[pressed]:shadow-sm [&_svg]:size-3.5"><Rows3 /></ToggleGroupItem>
				<ToggleGroupItem value="split" aria-label="Split diff view" className="h-6 min-w-6 rounded-[5px] px-1.5 text-muted-foreground data-[pressed]:bg-background data-[pressed]:text-foreground data-[pressed]:shadow-sm [&_svg]:size-3.5"><Columns2 /></ToggleGroupItem>
			</ToggleGroup>
			<ToolbarToggle label={wrap ? "Disable line wrapping" : "Enable line wrapping"} pressed={wrap} onPressedChange={setWrap}><TextWrap /></ToolbarToggle>
			{files.length > 0 && <Tip label={allCollapsed ? "Expand all files" : "Collapse all files"}><Button size="icon-sm" variant="ghost" className="text-muted-foreground [&_svg]:size-3.5" aria-label={allCollapsed ? "Expand all files" : "Collapse all files"} onClick={() => setCollapsed(Object.fromEntries(files.map(file => [file.filename, !allCollapsed])))}>{allCollapsed ? <ChevronsUpDown /> : <ChevronsDownUp />}</Button></Tip>}
			{files.length > 0 && <ToolbarToggle label={treeOpen ? "Hide file tree" : "Show file tree"} pressed={treeOpen} onPressedChange={setTreeOpen}><FolderTree /></ToolbarToggle>}
		</div>
	</div>;

	return <div className="flex h-full min-h-0 flex-col">
		{toolbar}
		<div className="flex min-h-0 flex-1">
			{treeOpen && files.length > 0 && <ScrollArea className="w-56 shrink-0 border-r border-border/60" aria-label="Changed files"><div className="p-1.5"><TreeRows nodes={tree} depth={0} onSelect={select} viewed={path => viewedState(viewed, path, files.find(file => file.filename === path)?.blobOid ?? "") === "viewed"} /></div></ScrollArea>}
			<ScrollArea className="min-w-0 flex-1" viewportRef={scroller} viewportClassName="pr-scroller">
				{error && <div className="flex items-center gap-2 px-4 py-3 text-xs"><span role="alert" className="text-destructive">{error}</span><Button size="xs" variant="ghost" onClick={() => void load(page || 1, page <= 1)}>Retry</Button></div>}
				{!files.length && loading && <p role="status" className="px-4 py-3 text-xs text-muted-foreground">Loading changed files…</p>}
				{!files.length && !loading && !error && <p className="px-4 py-3 text-xs text-muted-foreground">No changed files.</p>}
				{files.map(file => {
					const state = viewedState(viewed, file.filename, file.blobOid), closed = isCollapsed(file), status = statusLetter[file.status];
					const raw = pullRequestPatch(file), filtered = raw && ignoreWhitespace ? ignoreWhitespacePatch(raw) : undefined, patch = filtered ? filtered.patch : raw;
					const threads = threadsByPath.get(file.filename) ?? [];
					const anchored = threads.filter(thread => thread.line ?? thread.originalLine);
					const annotations: DiffLineAnnotation<string>[] = anchored.map(thread => ({ side: thread.side === "LEFT" ? "deletions" : "additions", lineNumber: (thread.line ?? thread.originalLine)!, metadata: thread.id }));
					const onlyWhitespace = filtered && !/^@@/m.test(filtered.patch);
					return <section key={file.filename} id={fileAnchor(file.filename)} aria-label={file.filename} className="border-b border-border/60" data-pr-file={file.filename}>
						<div className="sticky top-0 z-10 flex h-9 items-center gap-2 border-b border-border/60 bg-background px-3 text-xs">
							<button type="button" aria-label={closed ? `Expand ${file.filename}` : `Collapse ${file.filename}`} aria-expanded={!closed} onClick={() => setCollapsed(current => ({ ...current, [file.filename]: !closed }))} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
								<ChevronRight aria-hidden className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", !closed && "rotate-90")} />
								{status && <span className={cn("w-3 shrink-0 font-mono text-2xs font-semibold", status.tone)}>{status.letter}</span>}
								<Tip label={file.previousFilename ? `${file.previousFilename} → ${file.filename}` : file.filename}><span className="min-w-0 truncate font-mono">{file.filename}</span></Tip>
								{threads.length > 0 && <span className="shrink-0 text-2xs text-muted-foreground">{threads.length} {threads.length === 1 ? "thread" : "threads"}</span>}
							</button>
							<span className="flex shrink-0 items-center gap-3">
								<DiffStat additions={file.additions} deletions={file.deletions} className="font-mono text-2xs" />
								<label className="flex cursor-pointer items-center gap-1.5 text-2xs text-muted-foreground select-none">
									<input type="checkbox" className="size-3.5 accent-primary" aria-label={state === "changed" ? "Changed since viewed" : "Viewed"} checked={state === "viewed"} onChange={event => markViewed(file, event.target.checked)} />
									{state === "changed" ? <Tip label="This file has been pushed to since you marked it viewed."><span className="text-warning">Changed</span></Tip> : <span>Viewed</span>}
								</label>
							</span>
						</div>
						{!closed && <div className="min-w-0">
							{onlyWhitespace ? <p className="px-4 py-3 text-xs text-muted-foreground">Only whitespace changed in this file.</p>
								: patch ? <DiffView patch={patch} layout={layout} hideHeader hideActions wrap={wrap} annotations={annotations} renderAnnotation={annotation => { const thread = threads.find(value => value.id === annotation.metadata); return thread ? <ReviewThread thread={thread} projectId={projectId} pending={pending} onAction={onAction} /> : null; }} />
								: <p className="px-4 py-3 text-xs text-muted-foreground">{file.preview === "too-large" ? "This diff is too large to show here." : "GitHub did not provide a text diff for this file."} <button type="button" className="text-primary hover:underline" onClick={() => onOpen(`${view.url}/files`)}>Open on GitHub</button></p>}
							{threads.filter(thread => !anchored.includes(thread)).map(thread => <ReviewThread key={thread.id} thread={thread} projectId={projectId} pending={pending} onAction={onAction} />)}
						</div>}
					</section>;
				})}
				{hasNext && <div className="p-3"><Button size="sm" variant="ghost" className="w-full text-xs" disabled={loading} onClick={() => void load(page + 1, false)}>{loading ? "Loading…" : `Load more files (${total - files.length} left)`}</Button></div>}
				{total > 3000 && <p className="px-4 pb-3 text-xs text-muted-foreground">GitHub lists at most 3,000 files. Open the pull request on GitHub for the rest.</p>}
			</ScrollArea>
		</div>
	</div>;
}
