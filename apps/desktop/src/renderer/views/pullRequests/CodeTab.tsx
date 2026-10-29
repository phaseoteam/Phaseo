import { formatRelativeTime } from "@phaseo/app-kit/format";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Circle, CircleCheck, Columns2, File, Folder, FolderTree, Hammer, Info, MessageSquare, MessageSquareOff, MessageSquareReply, Pilcrow, Rows3, Settings2, TextWrap, Trash2, TriangleAlert } from "lucide-react";
import type { DiffLineAnnotation, SelectedLineRange } from "@pierre/diffs";
import type { PullRequestFile } from "../../../shared/pullRequestFiles";
import type { PullRequestAction, PullRequestComment, PullRequestReviewCommentDraft, PullRequestReviewThreadView, PullRequestView } from "../../../shared/pullRequestView";
import { DiffView } from "../../components/DiffView";
import type { DiffLayout } from "../../components/diffRendering";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import { ScrollArea } from "../../components/ui/scroll-area";
import { Textarea } from "../../components/ui/textarea";
import { showToast } from "../../components/ui/toast";
import { Toggle } from "../../components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import { pullRequestPatch } from "../../lib/pullRequestPatch";
import { usePersistedState } from "../../lib/persistedState";
import { useWorkspacePreferences } from "../../lib/workspacePreferences";
import { cn } from "../../lib/utils";
import { DiffFileHeadersLoading } from "../../panels/surfaceChrome";
import { ActorLabel, DiffStat, errorMessage, MetaLine, Tip } from "./presentation";
import { EditButton, MarkdownEditor, PullRequestCommentBody } from "./PullRequestMarkdown";
import { orderDiffFiles, patchLines } from "./pullRequestFileOrder";
import { agentSelectionPrompt, patchExcerpt, placeThreads, rangeLabel, rangeToDraft } from "./pullRequestDiff";
import { canEditComment, fileTree, findingKey, ignoreWhitespacePatch, type FileTreeNode } from "./pullRequestLogic";
import { nextPendingReviewCommentId, pullRequestReviewKey, reviewDrafts, usePendingReviewComments, type PendingReviewComment } from "./pullRequestReviewStore";
import { Reactions } from "./SummaryTab";
import type { PullRequestHandoff } from "./usePullRequestHandoff";
import { usePullRequestFilesViewed } from "./usePullRequestFilesViewed";

const statusLetter: Record<string, { letter: string; tone: string }> = { added: { letter: "A", tone: "text-emerald-600 dark:text-emerald-400" }, removed: { letter: "D", tone: "text-red-600 dark:text-red-400" }, renamed: { letter: "R", tone: "text-info" }, copied: { letter: "C", tone: "text-info" } };
const fileAnchor = (path: string) => `pr-file-${encodeURIComponent(path)}`;
const COMMIT_PAGE = 10;

function ToolbarToggle({ label, pressed, onPressedChange, children }: { label: string; pressed: boolean; onPressedChange: (pressed: boolean) => void; children: React.ReactNode }) {
	return <Tip label={label}><Toggle aria-label={label} size="sm" pressed={pressed} onPressedChange={onPressedChange} className="size-7 min-w-7 px-0 text-muted-foreground data-[pressed]:bg-accent data-[pressed]:text-foreground [&_svg]:size-3.5">{children}</Toggle></Tip>;
}
function WarningIcon({ label, children, icon = "warning" }: { label: string; children: React.ReactNode; icon?: "warning" | "info" | "scoped" }) {
	const Icon = icon === "info" ? Info : icon === "scoped" ? MessageSquareOff : TriangleAlert;
	return <Tip side="bottom" label={children}><span className="flex shrink-0 items-center"><Icon role="img" aria-label={label} className={cn("size-3.5", icon === "warning" ? "text-warning" : "text-muted-foreground")} /></span></Tip>;
}

type ThreadComment = Pick<PullRequestComment, "id" | "author" | "body" | "createdAt" | "reactions" | "canReact" | "canEdit" | "kind">;
/** One conversation, flat: its comments with edit, more comments on request, a reply box, Fix and Resolve. */
export function ReviewThread({ thread, view, projectId, pending, onAction, handoff }: { thread: PullRequestReviewThreadView; view: PullRequestView; projectId: string; pending: boolean; onAction: (action: PullRequestAction) => Promise<boolean>; handoff?: PullRequestHandoff }) {
	const [replying, setReplying] = useState(false), [draft, setDraft] = useState("");
	const [open, setOpen] = useState(!thread.resolved), [editing, setEditing] = useState<string>(), [saving, setSaving] = useState(false);
	const [more, setMore] = useState<{ comments: ThreadComment[]; cursor?: string }>({ comments: [], cursor: thread.commentsCursor }), [loadingMore, setLoadingMore] = useState(false);
	useEffect(() => { setMore({ comments: [], cursor: thread.commentsCursor }); }, [thread.id, thread.commentsCursor]);
	const comments: ThreadComment[] = [...thread.comments, ...more.comments.filter(extra => !thread.comments.some(comment => comment.id === extra.id))];
	const loadMore = async () => {
		const api = window.phaseoDesktop?.workspace;
		if (!api || !more.cursor || loadingMore) return;
		setLoadingMore(true);
		try {
			const page = await api.pullRequestThreads(projectId, { type: "comments", threadId: thread.id, cursor: more.cursor, number: view.number, headOid: view.headOid, baseOid: view.baseOid });
			if (page.type === "comments") setMore(current => ({ comments: [...current.comments, ...page.comments.map(comment => ({ id: comment.id, kind: "review-comment" as const, author: { login: comment.author }, body: comment.body, createdAt: comment.createdAt, reactions: [] }))], cursor: page.nextCursor }));
		} catch (reason) { showToast("error", "More comments could not be loaded", errorMessage(reason)); }
		finally { setLoadingMore(false); }
	};
	const reply = async () => { if (await onAction({ type: "reply", threadId: thread.id, body: draft })) { setDraft(""); setReplying(false); } };
	const save = async (commentId: string, body: string) => { setSaving(true); const done = await onAction({ type: "update-comment", commentId, kind: "review-comment", body }); setSaving(false); if (done) setEditing(undefined); };
	const finding = { kind: "thread" as const, thread }, fixing = handoff?.pendingFinding === findingKey(finding);
	return <div className="border-y border-border/60 bg-background px-3 py-2 font-sans text-xs whitespace-normal" data-thread-id={thread.id} onPointerDown={event => event.stopPropagation()}>
		<div className="flex items-center gap-2 text-muted-foreground">
			{thread.resolved ? <CircleCheck aria-hidden className="size-3.5 shrink-0 text-success" /> : <Circle aria-hidden className="size-3.5 shrink-0" />}
			<button type="button" className="min-w-0 truncate text-left hover:text-foreground" aria-expanded={open} onClick={() => setOpen(!open)}>{thread.resolved ? "Resolved" : "Open"} · {thread.totalComments} {thread.totalComments === 1 ? "comment" : "comments"}</button>
			{thread.outdated && <span className="shrink-0">outdated</span>}
			<span className="ml-auto flex shrink-0 items-center gap-1">
				{handoff && view.state === "OPEN" && <Button size="xs" variant="ghost" disabled={pending || fixing} onClick={() => void handoff.fix(view, finding)}><Hammer className="size-3" />{fixing ? "Preparing…" : handoff.labels.fixFinding}</Button>}
				{(thread.resolved ? thread.canUnresolve : thread.canResolve) && <Button size="xs" variant="ghost" disabled={pending} onClick={() => void onAction({ type: "resolve", threadId: thread.id, resolved: !thread.resolved })}>{thread.resolved ? "Unresolve" : "Resolve"}</Button>}
			</span>
		</div>
		{open && <div className="mt-2 space-y-3">
			{comments.map(comment => <article key={comment.id} className="group min-w-0 border-l-2 border-border/60 pl-3">
				<div className="flex items-center gap-2"><MetaLine className="min-w-0 flex-1 text-muted-foreground"><ActorLabel actor={comment.author} /><span>{formatRelativeTime(comment.createdAt)}</span></MetaLine>
					{canEditComment(comment) && editing !== comment.id && <EditButton label="Edit comment" onClick={() => setEditing(comment.id)} />}
					<Reactions reactions={comment.reactions} subjectId={comment.id} canReact={comment.canReact} /></div>
				{editing === comment.id ? <div className="mt-1"><MarkdownEditor value={comment.body} label="Edit comment" saving={saving} projectId={projectId} repository={view.repository} onSave={body => void save(comment.id, body)} onCancel={() => setEditing(undefined)} /></div>
					: <div className="mt-1"><PullRequestCommentBody text={comment.body} projectId={projectId} repository={view.repository} /></div>}
			</article>)}
			{more.cursor && <Button size="xs" variant="ghost" className="text-muted-foreground" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading…" : "Load more comments"}</Button>}
			{thread.canReply && (replying
				? <div className="space-y-2"><Textarea autoFocus value={draft} disabled={pending} onChange={event => setDraft(event.target.value)} placeholder="Reply" aria-label="Reply to this conversation" className="min-h-14 text-xs" onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setReplying(false); } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && draft.trim()) { event.preventDefault(); void reply(); } }} />
					<div className="flex justify-end gap-2"><Button size="xs" variant="ghost" disabled={pending} onClick={() => setReplying(false)}>Cancel</Button><Button size="xs" disabled={pending || !draft.trim()} onClick={() => void reply()}>{pending ? "Posting…" : "Reply"}</Button></div></div>
				: <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => setReplying(true)}><MessageSquareReply className="size-3.5" />Reply</Button>)}
		</div>}
	</div>;
}

/** A line comment held for the review, drawn flat with a dashed rule rather than T3's dashed card. */
function PendingComment({ comment, onRemove }: { comment: PendingReviewComment; onRemove: () => void }) {
	return <div className="border-y border-border/60 bg-background px-3 py-2 font-sans text-xs whitespace-normal" data-pending-comment={comment.id} onPointerDown={event => event.stopPropagation()}>
		<div className="border-l-2 border-dashed border-info/70 pl-3">
			<div className="flex items-center gap-2 text-muted-foreground"><MessageSquare aria-hidden className="size-3.5" /><span>Pending — sent when you submit the review</span>
				<Tip label="Discard this comment"><Button size="icon-xs" variant="ghost" className="ml-auto" aria-label="Discard this comment" onClick={onRemove}><Trash2 className="size-3.5" /></Button></Tip></div>
			<p className="mt-1.5 leading-relaxed whitespace-pre-wrap">{comment.body}</p>
		</div>
	</div>;
}

/** T3's draft under the marked lines: "Add to review" holds it for the composer, "Add to agent" hands the lines to a chat. */
function DraftComment({ label, onReview, onAgent, onCancel }: { label: string; onReview: (body: string) => void; onAgent?: (request: string) => void; onCancel: () => void }) {
	const [text, setText] = useState("");
	return <div className="border-y border-border/60 bg-background px-3 py-2 font-sans text-xs whitespace-normal" data-draft-comment="" onPointerDown={event => event.stopPropagation()}>
		<p className="mb-1.5 truncate font-mono text-muted-foreground">{label}</p>
		<Textarea autoFocus value={text} rows={3} onChange={event => setText(event.target.value)} placeholder="Leave a comment" aria-label={`Comment on ${label}`} className="min-h-16 text-xs"
			onKeyDown={event => { if (event.nativeEvent.isComposing) return; if (event.key === "Escape") { event.stopPropagation(); onCancel(); } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && text.trim()) { event.preventDefault(); event.stopPropagation(); onReview(text); } }} />
		<div className="mt-2 flex flex-wrap justify-end gap-2">
			<Button size="xs" variant="ghost" onClick={onCancel}>Cancel</Button>
			{onAgent && <Button size="xs" variant="outline" disabled={!text.trim()} onClick={() => onAgent(text)}>Add to agent</Button>}
			<Button size="xs" disabled={!text.trim()} onClick={() => onReview(text)}>Add to review</Button>
		</div>
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

type Draft = Omit<PullRequestReviewCommentDraft, "body"> & { range: SelectedLineRange };
type Annotation = `thread:${string}` | `pending:${string}` | "draft";
const noSelection = () => {};

/**
 * Every changed file as its own diff, in reading order (source, then tests, then generated), with T3's toolbar: the
 * commit scope first, one count with its caveats as icons, and the diff options folded into a menu when narrow.
 * Viewed ticks are GitHub's own. Dragging line numbers drafts a line comment for the review or for the agent.
 */
export function CodeTab({ view, projectId, pending, onAction, onOpen, handoff, commit, onCommitChange, reveal }: { view: PullRequestView; projectId: string; pending: boolean; onAction: (action: PullRequestAction) => Promise<boolean>; onOpen: (url: string) => void; handoff?: PullRequestHandoff; commit: string | null; onCommitChange: (oid: string | null) => void; reveal?: { path: string; nonce: number } }) {
	const api = window.phaseoDesktop?.workspace;
	const [files, setFiles] = useState<PullRequestFile[]>([]), [page, setPage] = useState(0), [hasNext, setHasNext] = useState(false), [total, setTotal] = useState(view.changedFiles);
	const [loading, setLoading] = useState(true), [error, setError] = useState("");
	const [layout, setLayout] = usePersistedState<DiffLayout>("phaseo.desktop.pullRequestDiffLayout", "unified");
	const [wrap, setWrap] = usePersistedState("phaseo.desktop.pullRequestDiffWrap", true);
	const [ignoreWhitespace, setIgnoreWhitespace] = usePersistedState("phaseo.desktop.pullRequestIgnoreWhitespace", false);
	const [treeOpen, setTreeOpen] = usePersistedState("phaseo.desktop.pullRequestFileTree", false);
	const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
	const { diffFilesCollapsed } = useWorkspacePreferences();
	const [draft, setDraft] = useState<Draft | null>(null), [offDiffOpen, setOffDiffOpen] = useState(false), [commitsShown, setCommitsShown] = useState(COMMIT_PAGE);
	const scroller = useRef<HTMLDivElement>(null);
	const reviewKey = pullRequestReviewKey(projectId, view.repository, view.number), pendingComments = usePendingReviewComments(reviewKey);
	const scoped = commit !== null, revision = `${view.headOid}:${view.baseOid}:${commit ?? "all"}`;
	const canComment = !scoped && view.state === "OPEN";
	const load = useCallback(async (next: number, replace: boolean) => {
		if (!api) { setLoading(false); setError("Open the desktop app to load changed files."); return; }
		setLoading(true); setError("");
		try {
			const result = await api.pullRequestFiles(projectId, { number: view.number, page: next, headOid: view.headOid, baseOid: view.baseOid, ...(commit ? { commit } : {}) });
			setFiles(current => replace ? result.files : [...current, ...result.files.filter(file => !current.some(other => other.filename === file.filename))]);
			setPage(result.page); setHasNext(result.hasNext); setTotal(result.total);
		} catch (reason) { setError(errorMessage(reason)); }
		finally { setLoading(false); }
	}, [api, projectId, view.number, view.headOid, view.baseOid, commit]);
	// Reload only when the reviewed revision or the scope changes, not on every new view object.
	useEffect(() => { setFiles([]); setDraft(null); void load(1, true); }, [revision, load]);
	const blobs = useMemo(() => new Map(files.map(file => [file.filename, file.blobOid])), [files]);
	const viewed = usePullRequestFilesViewed({ projectId, repository: view.repository, number: view.number, blobs });
	const ordered = useMemo(() => { const byPath = new Map(files.map(file => [file.filename, file])); return orderDiffFiles(files.map(file => ({ path: file.filename, lines: patchLines(file.patch) }))).map(path => byPath.get(path)!); }, [files]);
	const markViewed = (file: PullRequestFile, next: boolean) => {
		viewed.setViewed(file.filename, next);
		// Ticking a file folds it away, as T3 Code does; unticking opens it again.
		setCollapsed(current => ({ ...current, [file.filename]: next }));
	};
	const isCollapsed = (file: PullRequestFile) => collapsed[file.filename] ?? (diffFilesCollapsed || (!scoped && viewed.isViewed(file.filename)));
	const allCollapsed = files.length > 0 && files.every(isCollapsed);
	const tree = useMemo(() => fileTree(ordered.map(file => file.filename)), [ordered]);
	const patches = useMemo(() => new Map(files.map(file => [file.filename, file.patch])), [files]);
	const placed = useMemo(() => placeThreads(view.threads, patches, !hasNext), [view.threads, patches, hasNext]);
	const offDiff = scoped ? [] : placed.offDiff;
	const withheld = files.some(file => file.preview !== "available");
	const commits = useMemo(() => [...view.commits].sort((left, right) => Date.parse(right.committedAt) - Date.parse(left.committedAt)), [view.commits]);
	const select = useCallback((path: string) => { setCollapsed(current => ({ ...current, [path]: false })); requestAnimationFrame(() => document.getElementById(fileAnchor(path))?.scrollIntoView({ block: "start" })); }, []);
	useEffect(() => { if (reveal) select(reveal.path); }, [reveal, select]);
	const viewedCount = viewed.count(files.map(file => file.filename));
	const scopeLabel = commit ? commits.find(entry => entry.oid === commit)?.headline || commit.slice(0, 7) : "All commits";
	const startDraft = useCallback((path: string, range: SelectedLineRange) => setDraft({ ...rangeToDraft(path, range), range }), []);

	const addToReview = (body: string) => { if (!draft) return; reviewDrafts.addComment(reviewKey, { id: nextPendingReviewCommentId(), path: draft.path, line: draft.line, side: draft.side, ...(draft.startLine ? { startLine: draft.startLine, startSide: draft.startSide } : {}), body }); setDraft(null); };
	const addToAgent = (request: string) => {
		if (!draft || !handoff) return;
		const start = draft.startLine && draft.startSide === draft.side ? draft.startLine : draft.line;
		handoff.ask(agentSelectionPrompt({ number: view.number, path: draft.path, draft, lines: patchExcerpt(patches.get(draft.path), draft.side, start, draft.line), request }));
		setDraft(null);
	};
	const layoutGroup = <ToggleGroup aria-label="Diff layout" value={layout} onValueChange={(value: string) => { if (value === "unified" || value === "split") setLayout(value); }} spacing={0.5} className="rounded-md bg-muted/70 p-0.5">
		<ToggleGroupItem value="unified" aria-label="Stacked diff view" className="h-6 min-w-6 rounded-[5px] px-1.5 text-muted-foreground data-[pressed]:bg-background data-[pressed]:text-foreground data-[pressed]:shadow-sm [&_svg]:size-3.5"><Rows3 /></ToggleGroupItem>
		<ToggleGroupItem value="split" aria-label="Split diff view" className="h-6 min-w-6 rounded-[5px] px-1.5 text-muted-foreground data-[pressed]:bg-background data-[pressed]:text-foreground data-[pressed]:shadow-sm [&_svg]:size-3.5"><Columns2 /></ToggleGroupItem>
	</ToggleGroup>;

	const toolbar = <div className="flex h-10 min-h-10 shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-background px-4 text-xs text-muted-foreground">
		<div className="flex min-w-0 flex-1 items-center gap-2">
			{commits.length > 0 && <DropdownMenu>
				<DropdownMenuTrigger render={<Button size="xs" variant="ghost" className="-ml-2 max-w-56 min-w-0 shrink text-muted-foreground" aria-label={`Diff scope: ${scopeLabel}`} />}><span className="truncate">{scopeLabel}</span><ChevronDown aria-hidden className="size-3.5 shrink-0 opacity-70" /></DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-auto max-w-[min(28rem,calc(100vw-2rem))]">
					<DropdownMenuRadioGroup value={commit ?? "all"} onValueChange={value => onCommitChange(value === "all" ? null : String(value))}>
						<DropdownMenuRadioItem value="all" closeOnClick>All commits</DropdownMenuRadioItem>
						{commits.slice(0, commitsShown).map(entry => <DropdownMenuRadioItem key={entry.oid} value={entry.oid} closeOnClick><span className="flex min-w-0 items-center gap-2"><span className="min-w-0 truncate">{entry.headline || "Untitled commit"}</span><span className="ml-auto shrink-0 font-mono text-muted-foreground">{entry.oid.slice(0, 7)}</span></span></DropdownMenuRadioItem>)}
					</DropdownMenuRadioGroup>
					{commits.length > commitsShown && <DropdownMenuItem closeOnClick={false} onClick={() => setCommitsShown(count => count + COMMIT_PAGE)}><span className="text-muted-foreground">Show more ({commits.length - commitsShown} left)</span></DropdownMenuItem>}
				</DropdownMenuContent>
			</DropdownMenu>}
			<MetaLine className="min-w-0 flex-1">
				<span className="shrink-0 tabular-nums">{total} {total === 1 ? "file" : "files"}{scoped && hasNext ? "+" : ""}</span>
				{!scoped && files.length > 0 && <span className="flex min-w-0 items-center gap-1 tabular-nums" data-viewed-count="">
					<span className="shrink-0">{viewedCount} / {total}</span>{" "}<span className="truncate">{viewed.local ? "viewed here" : "viewed"}</span>
					{viewed.local && <WarningIcon icon="info" label="These ticks are kept here, not on GitHub">GitHub's record of the files you have viewed could not be read, so these ticks are kept on this computer. github.com will not show them.</WarningIcon>}
					{viewed.error !== null && !viewed.local && <WarningIcon label="Your ticks could not be read">The boxes below are whatever was last read. {viewed.error}</WarningIcon>}
					{viewed.truncated && <WarningIcon label="This count covers only part of the change">This change has more files than GitHub reports ticks for in one read, so the count is short and some boxes start empty.</WarningIcon>}
				</span>}
				{withheld && <WarningIcon label="Some of this diff was not shown">GitHub withheld part of this diff: a binary file, or a change too large to show inline.</WarningIcon>}
				{scoped && view.state === "OPEN" && <WarningIcon icon="scoped" label="Line comments are written from the whole change">A comment is anchored to the whole change, so switch to All commits to write one.</WarningIcon>}
			</MetaLine>
		</div>
		<div className="flex shrink-0 items-center gap-1">
			<DropdownMenu>
				<Tip label="Diff options"><DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" className="text-muted-foreground @min-[36rem]/code:hidden [&_svg]:size-3.5" aria-label="Diff options" />}><Settings2 /></DropdownMenuTrigger></Tip>
				<DropdownMenuContent align="end" className="w-48">
					<DropdownMenuCheckboxItem checked={ignoreWhitespace} onCheckedChange={checked => setIgnoreWhitespace(checked === true)}>Hide whitespace changes</DropdownMenuCheckboxItem>
					<DropdownMenuCheckboxItem checked={wrap} onCheckedChange={checked => setWrap(checked === true)}>Wrap lines</DropdownMenuCheckboxItem>
					<DropdownMenuSeparator />
					<DropdownMenuRadioGroup value={layout} onValueChange={value => { if (value === "unified" || value === "split") setLayout(value); }}>
						<DropdownMenuRadioItem value="unified" closeOnClick>Stacked</DropdownMenuRadioItem>
						<DropdownMenuRadioItem value="split" closeOnClick>Split</DropdownMenuRadioItem>
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>
			<div className="hidden items-center gap-1 @min-[36rem]/code:flex">
				<ToolbarToggle label={ignoreWhitespace ? "Show whitespace changes" : "Hide whitespace changes"} pressed={ignoreWhitespace} onPressedChange={setIgnoreWhitespace}><Pilcrow /></ToolbarToggle>
				{layoutGroup}
				<ToolbarToggle label={wrap ? "Disable line wrapping" : "Enable line wrapping"} pressed={wrap} onPressedChange={setWrap}><TextWrap /></ToolbarToggle>
			</div>
			{files.length > 0 && <Tip label={allCollapsed ? "Expand all files" : "Collapse all files"}><Button size="icon-sm" variant="ghost" className="text-muted-foreground [&_svg]:size-3.5" aria-label={allCollapsed ? "Expand all files" : "Collapse all files"} onClick={() => setCollapsed(Object.fromEntries(files.map(file => [file.filename, !allCollapsed])))}>{allCollapsed ? <ChevronsUpDown /> : <ChevronsDownUp />}</Button></Tip>}
			{files.length > 0 && <ToolbarToggle label={treeOpen ? "Hide file tree" : "Show file tree"} pressed={treeOpen} onPressedChange={setTreeOpen}><FolderTree /></ToolbarToggle>}
		</div>
	</div>;

	const threadCard = (thread: PullRequestReviewThreadView) => <ReviewThread key={`${view.repository}#${view.number}:${thread.id}`} thread={thread} view={view} projectId={projectId} pending={pending} onAction={onAction} handoff={handoff} />;
	return <div className="@container/code flex h-full min-h-0 flex-col">
		{toolbar}
		<div className="flex min-h-0 flex-1">
			{treeOpen && files.length > 0 && <ScrollArea className="w-56 shrink-0 border-r border-border/60" aria-label="Changed files"><div className="p-1.5"><TreeRows nodes={tree} depth={0} onSelect={select} viewed={path => !scoped && viewed.isViewed(path)} /></div></ScrollArea>}
			<ScrollArea className="min-w-0 flex-1" viewportRef={scroller} viewportClassName="pr-scroller">
				{error && <div className="flex items-center gap-2 px-4 py-3 text-xs"><span role="alert" className="text-destructive">{error}</span><Button size="xs" variant="ghost" onClick={() => void load(page || 1, page <= 1)}>Retry</Button></div>}
				{!files.length && loading && <DiffFileHeadersLoading label="Loading changed files…" />}
				{!files.length && !loading && !error && <p className="px-4 py-3 text-xs text-muted-foreground">{scoped ? "This commit changes no files." : "No changed files."}</p>}
				{ordered.map(file => {
					const closed = isCollapsed(file), status = statusLetter[file.status], ticked = viewed.isViewed(file.filename), stale = viewed.isStale(file.filename);
					const raw = pullRequestPatch(file), filtered = raw && ignoreWhitespace ? ignoreWhitespacePatch(raw) : undefined, patch = filtered ? filtered.patch : raw;
					const threads = scoped ? [] : placed.anchored.get(file.filename) ?? [];
					const mine = scoped ? [] : pendingComments.filter(comment => comment.path === file.filename);
					const toAnnotation = (side: "LEFT" | "RIGHT", lineNumber: number, metadata: Annotation): DiffLineAnnotation<string> => ({ side: side === "LEFT" ? "deletions" : "additions", lineNumber, metadata });
					const annotations = [...threads.map(thread => toAnnotation(thread.side, thread.line!, `thread:${thread.id}`)), ...mine.map(comment => toAnnotation(comment.side, comment.line, `pending:${comment.id}`)), ...(draft?.path === file.filename ? [toAnnotation(draft.side, draft.line, "draft")] : [])];
					const onlyWhitespace = filtered && !/^@@/m.test(filtered.patch);
					const renderAnnotation = (annotation: DiffLineAnnotation<string>) => {
						const key = annotation.metadata as Annotation;
						if (key === "draft") return draft ? <DraftComment label={rangeLabel(draft.path, draft)} onReview={addToReview} {...(handoff ? { onAgent: addToAgent } : {})} onCancel={() => setDraft(null)} /> : null;
						if (key.startsWith("pending:")) { const comment = mine.find(value => `pending:${value.id}` === key); return comment ? <PendingComment comment={comment} onRemove={() => reviewDrafts.removeComment(reviewKey, comment.id)} /> : null; }
						const thread = threads.find(value => `thread:${value.id}` === key);
						return thread ? threadCard(thread) : null;
					};
					// One draft at a time, as T3 does: while it is open only its own lines stay marked.
					const lineSelection = !canComment ? undefined : !draft ? { selected: null, onSelect: (range: SelectedLineRange) => startDraft(file.filename, range) } : draft.path === file.filename ? { selected: draft.range, onSelect: noSelection } : undefined;
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
								{!scoped && <label className="flex cursor-pointer items-center gap-1.5 text-2xs text-muted-foreground select-none" data-viewed-toggle="">
									<Checkbox aria-label={stale ? "Changed" : "Viewed"} checked={ticked} onCheckedChange={next => markViewed(file, next === true)} />
									{stale ? <Tip label="This file has been pushed to since you marked it viewed."><span className="text-warning">Changed</span></Tip> : <span className="@max-[24rem]/code:hidden">Viewed</span>}
								</label>}
							</span>
						</div>
						{!closed && <div className="min-w-0">
							{onlyWhitespace ? <p className="px-4 py-3 text-xs text-muted-foreground">Only whitespace changed in this file.</p>
								: patch ? <DiffView patch={patch} layout={layout} hideHeader hideActions wrap={wrap} annotations={annotations} renderAnnotation={renderAnnotation} {...(lineSelection ? { lineSelection } : {})} />
								: <p className="px-4 py-3 text-xs text-muted-foreground">{file.preview === "too-large" ? "This diff is too large to show here." : "GitHub did not provide a text diff for this file."} <button type="button" className="text-primary hover:underline" onClick={() => onOpen(`${view.url}/files`)}>Open on GitHub</button></p>}
						</div>}
					</section>;
				})}
				{hasNext && <div className="p-3"><Button size="sm" variant="ghost" className="w-full text-xs" disabled={loading} onClick={() => void load(page + 1, false)}>{loading ? "Loading…" : scoped ? "Load more files" : `Load more files (${total - files.length} left)`}</Button></div>}
				{!scoped && total > 3000 && <p className="px-4 pb-3 text-xs text-muted-foreground">GitHub lists at most 3,000 files. Open the pull request on GitHub for the rest.</p>}
				{offDiff.length > 0 && <section aria-label="Conversations not on the current diff" className="border-b border-border/60" data-off-diff-threads="">
					<button type="button" aria-expanded={offDiffOpen} onClick={() => setOffDiffOpen(!offDiffOpen)} className="flex h-9 w-full items-center gap-1.5 px-3 text-left text-xs text-muted-foreground hover:text-foreground">
						<ChevronRight aria-hidden className={cn("size-3.5 shrink-0 transition-transform", offDiffOpen && "rotate-90")} /><span className="font-medium">Conversations not on the current diff</span><span className="tabular-nums">({offDiff.length})</span>
					</button>
					{offDiffOpen && offDiff.map(thread => <div key={thread.id}><p className="truncate px-3 pt-2 font-mono text-2xs text-muted-foreground">{thread.path}{thread.line ?? thread.originalLine ? `:${thread.line ?? thread.originalLine}` : ""}</p>{threadCard(thread)}</div>)}
				</section>}
				<div className="h-16" aria-hidden />
			</ScrollArea>
		</div>
	</div>;
}
