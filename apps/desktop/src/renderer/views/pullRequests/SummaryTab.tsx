import { formatDateTime, formatRelativeTime } from "@phaseo/app-kit/format";
import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { ArrowDownUp, ChevronDown, ChevronRight, Hammer, ListFilter, SmilePlus, Tag, UserPlus, Users } from "lucide-react";
import { pullRequestReactionContents, type PullRequestAction, type PullRequestComment, type PullRequestReaction, type PullRequestReactionContent, type PullRequestView } from "../../../shared/pullRequestView";
import { Button } from "../../components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../components/ui/collapsible";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import { ScrollArea } from "../../components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { usePersistedState } from "../../lib/persistedState";
import { cn } from "../../lib/utils";
import { ActorAvatar, ActorLabel, CheckStatusIcon, checkStatusLabel, REVIEW_OUTCOME_PRESENTATION, ReviewOutcomeLabel, reviewOutcomeStaleLabel, Tip } from "./presentation";
import { CandidatePicker } from "./CandidatePicker";
import { EditButton, MarkdownEditor, PullRequestCommentBody, PullRequestMarkdown } from "./PullRequestMarkdown";
import { applyPendingReactions, canEditComment, canEditDescription, findingKey, isBot, isFinished, reactionEmoji, reactionName, reactionTooltip, reviewerEntries, reviewOutcome, sectionCollapseAnchorScrollTop, visibleBody, type PullRequestFinding } from "./pullRequestLogic";
import type { PullRequestHandoff } from "./usePullRequestHandoff";
import { removeAll } from "../../../shared/removeAll";

function MetaRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
	return <div className="grid min-h-6 min-w-0 grid-cols-[6rem_minmax(0,1fr)] items-center gap-2 text-xs"><span className="flex items-center gap-1.5 text-muted-foreground">{icon}{label}</span><span className="flex min-w-0 items-center gap-1.5 text-foreground">{children}</span></div>;
}

/**
 * A collapsible section whose heading rides the top of the scroll box, so it folds from wherever it was read to; folding
 * one whose heading is pinned keeps the heading where it was rather than dropping the reader further down.
 */
export function Section({ title, defaultOpen = true, actions, children }: { title: string; defaultOpen?: boolean; actions?: ReactNode; children: ReactNode }) {
	const [open, setOpen] = useState(defaultOpen);
	const heading = useRef<HTMLDivElement>(null);
	const change = (next: boolean) => {
		const section = heading.current?.closest<HTMLElement>("section"), scroller = heading.current?.closest<HTMLElement>(".pr-scroller");
		if (!next && heading.current && section && scroller) {
			const target = sectionCollapseAnchorScrollTop({ scrollTop: scroller.scrollTop, viewportTop: scroller.getBoundingClientRect().top, sectionTop: section.getBoundingClientRect().top, headingTop: heading.current.getBoundingClientRect().top });
			if (target !== null) scroller.scrollTop = target;
		}
		setOpen(next);
	};
	return <Collapsible open={open} onOpenChange={change} render={<section aria-label={title} />}>
		<div ref={heading} className="sticky top-0 z-10 flex w-full items-center bg-background pr-4">
			<CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-1.5 px-4 py-3 text-left text-xs font-medium text-muted-foreground hover:text-foreground">
				<span>{title}</span><ChevronRight aria-hidden className={cn("size-3.5 text-muted-foreground/60 transition-transform", open && "rotate-90")} />
			</CollapsibleTrigger>
			{actions}
		</div>
		<CollapsibleContent><div className="px-4 pb-4">{children}</div></CollapsibleContent>
	</Collapsible>;
}

/** How a reaction pill reaches GitHub; the pane provides it so every tab's comments can react. */
export const ReactContext = createContext<((subjectId: string, content: PullRequestReactionContent, reacted: boolean) => Promise<boolean>) | undefined>(undefined);
const pill = "inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-1.5 text-2xs tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
const reactionSignature = (reactions: readonly PullRequestReaction[]) => reactions.map(reaction => `${reaction.content}:${reaction.count}:${reaction.viewerHasReacted ? 1 : 0}`).join(" ");

/** The reaction bar: reactions you can press to add or take back your own reaction, and a picker for the rest. */
export function Reactions({ reactions, subjectId, canReact = false }: { reactions: PullRequestComment["reactions"]; subjectId?: string; canReact?: boolean }) {
	const react = useContext(ReactContext), active = Boolean(react && subjectId && canReact);
	const [pending, setPending] = useState<{ signature: string; values: Map<string, boolean> }>({ signature: "", values: new Map() });
	const [pickerOpen, setPickerOpen] = useState(false);
	const signature = reactionSignature(reactions), values = pending.signature === signature ? pending.values : new Map<string, boolean>();
	const shown = applyPendingReactions(reactions, values);
	if (!shown.length && !active) return null;
	// A press is forgotten as soon as GitHub's real counts arrive; a failure takes it back.
	const toggle = async (content: PullRequestReactionContent, reacted: boolean) => {
		setPending({ signature, values: new Map([...values, [content, reacted]]) });
		if (!await react!(subjectId!, content, reacted)) setPending(current => { const next = new Map(current.values); next.delete(content); return { signature: current.signature, values: next }; });
	};
	return <span className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1" data-reactions={subjectId}>
		{shown.map(reaction => <Tip key={reaction.content} label={reactionTooltip(reaction)}><button type="button" disabled={!active} aria-pressed={reaction.viewerHasReacted === true} aria-label={`${reactionName(reaction.content)}, ${reaction.count}`} onClick={() => void toggle(reaction.content as PullRequestReactionContent, !reaction.viewerHasReacted)}
			className={cn(pill, reaction.viewerHasReacted ? "border-primary/60 bg-primary/10 text-foreground" : "border-transparent bg-muted/60 text-muted-foreground", active ? "hover:border-primary/60" : "cursor-default")}><span aria-hidden>{reactionEmoji[reaction.content] ?? "•"}</span>{reaction.count}</button></Tip>)}
		{active && <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
			<Tip label="Add a reaction"><PopoverTrigger render={<button type="button" aria-label="Add a reaction" className={cn(pill, "border-transparent px-1 text-muted-foreground hover:bg-accent/60 hover:text-foreground")} />}><SmilePlus aria-hidden className="size-3.5" /></PopoverTrigger></Tip>
			<PopoverContent align="end" side="top" className="w-auto gap-0 p-1"><div className="flex items-center gap-0.5">
				{pullRequestReactionContents.map(content => { const reacted = shown.find(reaction => reaction.content === content)?.viewerHasReacted === true; return <button key={content} type="button" aria-pressed={reacted} aria-label={reactionName(content)} onClick={() => { setPickerOpen(false); void toggle(content, !reacted); }} className={cn("flex size-7 items-center justify-center rounded-md text-base outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", reacted && "bg-primary/10")}><span aria-hidden>{reactionEmoji[content]}</span></button>; })}
			</div></PopoverContent>
		</Popover>}
	</span>;
}

function CommentIdentity({ comment, onOpen }: { comment: PullRequestComment; onOpen: (url: string) => void }) {
	return <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
		<ActorLabel actor={comment.author} className="max-w-full" />
		<Tip label={`${formatDateTime(comment.createdAt)}${comment.url ? " · Open comment on GitHub" : ""}`}>
			{comment.url ? <button type="button" onClick={() => onOpen(comment.url!)} className="text-muted-foreground hover:text-foreground hover:underline"><time dateTime={comment.createdAt}>{formatRelativeTime(comment.createdAt)}</time></button> : <span className="text-muted-foreground"><time dateTime={comment.createdAt}>{formatRelativeTime(comment.createdAt)}</time></span>}
		</Tip>
		{comment.editedAt && <Tip label={`Edited ${formatDateTime(comment.editedAt)}`}><span className="text-muted-foreground">edited</span></Tip>}
	</div>;
}
function CommentLocation({ comment, view }: { comment: PullRequestComment; view: PullRequestView }) {
	const thread = comment.threadId ? view.threads.find(value => value.id === comment.threadId) : undefined, path = thread?.path ?? comment.path;
	if (!path) return null;
	const label = `${path}${thread?.line ? `:${thread.line}` : ""}`;
	return <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground"><span className="truncate font-mono">{label}</span>{thread?.outdated && <span className="shrink-0">Outdated</span>}</div>;
}

/** The things a comment row can do besides react: edit it, or hand its finding to an agent. */
export type CommentActions = { projectId: string; view: PullRequestView; onAction?: (action: PullRequestAction) => Promise<boolean>; handoff?: PullRequestHandoff };
/** An edit button and the Write/Preview editor it opens, for one comment. Shared by Summary and Timeline. */
export function useCommentEditor({ view, onAction }: Pick<CommentActions, "view" | "onAction">) {
	const [editing, setEditing] = useState<string>(), [saving, setSaving] = useState(false);
	const save = async (comment: PullRequestComment, body: string) => {
		if (!onAction) return;
		setSaving(true);
		const done = await onAction({ type: "update-comment", commentId: comment.id, kind: comment.kind, body });
		setSaving(false);
		if (done) setEditing(undefined);
	};
	return {
		editing,
		button: (comment: PullRequestComment) => onAction && canEditComment(comment) && editing !== comment.id ? <EditButton label="Edit comment" onClick={() => setEditing(comment.id)} /> : null,
		editor: (comment: PullRequestComment, projectId: string) => editing === comment.id ? <MarkdownEditor value={comment.body} label="Edit comment" saving={saving} projectId={projectId} repository={view.repository} onSave={body => void save(comment, body)} onCancel={() => setEditing(undefined)} /> : null,
	};
}
function FixButton({ finding, view, handoff, label }: { finding: PullRequestFinding; view: PullRequestView; handoff?: PullRequestHandoff; label?: string }) {
	if (!handoff || view.state !== "OPEN") return null;
	const preparing = handoff.pendingFinding === findingKey(finding);
	return <Button size="xs" variant="ghost" className="shrink-0 text-muted-foreground" disabled={handoff.pendingFinding !== undefined || handoff.pending !== undefined} onClick={() => void handoff.fix(view, finding)}><Hammer aria-hidden className="size-3" />{preparing ? "Preparing…" : label ?? handoff.labels.fixFinding}</Button>;
}

/** Flat rows with a left rule rather than bordered cards. */
function CommentRow({ comment, actions, onOpen, editor }: { comment: PullRequestComment; actions: CommentActions; onOpen: (url: string) => void; editor: ReturnType<typeof useCommentEditor> }) {
	const { view, projectId } = actions;
	const outcome = reviewOutcome(comment.reviewState), body = visibleBody(comment.body);
	const [open, setOpen] = useState(false);
	const inThread = comment.threadId !== undefined, remark = comment.kind === "review" && !inThread && body;
	if (isFinished(comment, view.threads)) {
		const resolved = view.threads.find(thread => thread.id === comment.threadId)?.resolved;
		return <Collapsible open={open} onOpenChange={setOpen} render={<article className="border-l-2 border-border/60 py-1 pl-3" data-comment-id={comment.id} />}>
			<div className="flex flex-wrap items-start gap-2"><CommentIdentity comment={comment} onOpen={onOpen} />
				<CollapsibleTrigger className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground">{resolved ? "Resolved" : "Review dismissed"}<ChevronDown aria-hidden className={cn("size-3.5 transition-transform", open && "rotate-180")} /></CollapsibleTrigger>
				<Reactions reactions={comment.reactions} subjectId={comment.id} canReact={comment.canReact} />
			</div>
			<CommentLocation comment={comment} view={view} />
			{!open && body && <p className="mt-1 truncate text-xs text-muted-foreground">{removeAll(body, /<!--[\s\S]*?-->/g).replace(/[*`#>]/g, "").replace(/\s+/g, " ").trim()}</p>}
			<CollapsibleContent>{body && <div className="mt-2"><PullRequestCommentBody text={body} projectId={projectId} repository={view.repository} /></div>}</CollapsibleContent>
		</Collapsible>;
	}
	const thread = inThread ? view.threads.find(value => value.id === comment.threadId) : undefined;
	const finding: PullRequestFinding | undefined = thread && !thread.resolved && thread.comments[0]?.id === comment.id ? { kind: "thread", thread } : remark ? { kind: "comment", comment } : undefined;
	return <article className="group border-l-2 border-border/60 py-1 pl-3" data-comment-id={comment.id}>
		<div className="flex flex-wrap items-start gap-2">
			<div className="flex min-w-0 flex-1 flex-wrap items-center gap-2"><CommentIdentity comment={comment} onOpen={onOpen} />{outcome ? <ReviewOutcomeLabel outcome={outcome} /> : comment.reviewState && comment.reviewState !== "COMMENTED" ? <span className="text-xs text-muted-foreground">{comment.reviewState.charAt(0) + comment.reviewState.slice(1).toLowerCase().replaceAll("_", " ")}</span> : null}</div>
			{editor.button(comment)}
			{finding && <FixButton finding={finding} view={view} handoff={actions.handoff} />}
			<Reactions reactions={comment.reactions} subjectId={comment.id} canReact={comment.canReact} />
		</div>
		<CommentLocation comment={comment} view={view} />
		{editor.editing === comment.id ? <div className="mt-2">{editor.editor(comment, projectId)}</div> : body && <div className="mt-2"><PullRequestCommentBody text={body} projectId={projectId} repository={view.repository} /></div>}
	</article>;
}

const PAGE = 10;
export function SummaryTab({ view, projectId, onOpen, onAction, onScrollerRef, pending, handoff, checksStale = false, onRefresh }: { view: PullRequestView; projectId: string; onOpen: (url: string) => void; onAction?: (action: PullRequestAction) => Promise<boolean>; onScrollerRef?: (node: HTMLDivElement | null) => void; pending?: PullRequestAction["type"]; handoff?: PullRequestHandoff; checksStale?: boolean; onRefresh?: () => void }) {
	const [filter, setFilter] = usePersistedState("phaseo.desktop.pullRequestCommentFilter", { bots: false, resolved: false });
	const [order, setOrder] = useState<"newest" | "oldest">("newest");
	const [shown, setShown] = useState(PAGE), [editingBody, setEditingBody] = useState(false);
	const editor = useCommentEditor({ view, onAction });
	const filtered = view.comments.filter(comment => (filter.bots || !isBot(comment)) && (filter.resolved || !isFinished(comment, view.threads)));
	const hiddenByFilter = view.comments.length - filtered.length;
	const recent = filtered.slice(Math.max(0, filtered.length - shown)), older = filtered.length - recent.length;
	const visible = order === "newest" ? [...recent].reverse() : recent;
	const reviewers = reviewerEntries(view);
	const actions: CommentActions = { projectId, view, onAction, handoff };
	const saveBody = async (body: string) => { if (!onAction) return; if (body === view.body || await onAction({ type: "body", body })) setEditingBody(false); };
	const showOlder = older > 0 && <Button size="sm" variant="ghost" className="w-full text-xs" onClick={() => setShown(shown + PAGE)}>Show {Math.min(older, PAGE)} older {older === 1 ? "comment" : "comments"} ({older} hidden)</Button>;
	return <ScrollArea className="h-full" viewportRef={onScrollerRef} viewportClassName="pr-scroller">
		<section className="space-y-2 px-4 pt-2.5 pb-1">
			<MetaRow icon={<Users className="size-3.5" />} label="Reviewers">
				{reviewers.length ? <span className="flex items-center -space-x-1">{reviewers.map(entry => {
					const login = entry.actor?.login ?? "ghost", verdict = entry.outcome ? (entry.stale ? reviewOutcomeStaleLabel(entry.outcome) : REVIEW_OUTCOME_PRESENTATION[entry.outcome].label) : undefined;
					return <Tip key={entry.key} side="bottom" label={verdict ? `${login} — ${verdict}` : login}>
						<span className={cn("relative rounded-full hover:z-10", entry.outcome ? (entry.stale ? REVIEW_OUTCOME_PRESENTATION[entry.outcome].staleRingClassName : REVIEW_OUTCOME_PRESENTATION[entry.outcome].ringClassName) : "ring-2 ring-background")} data-reviewer={login}><ActorAvatar actor={entry.actor} /><span className="sr-only">{login}{verdict ? `, ${verdict}` : ""}</span></span>
					</Tip>;
				})}</span> : <span className="text-muted-foreground">None</span>}
				{onAction && view.state === "OPEN" && <CandidatePicker projectId={projectId} number={view.number} kind="reviewers" allowed={view.viewer.canUpdate} icon={<UserPlus className="size-3.5" />} onToggle={candidate => onAction({ type: "reviewer", login: candidate.key, requested: !candidate.applied })} />}
			</MetaRow>
			{(view.labels.length > 0 || onAction) && <MetaRow icon={<Tag className="size-3.5" />} label="Labels"><span className="flex min-w-0 flex-wrap items-center gap-1">{!view.labels.length && <span className="text-muted-foreground">None</span>}{view.labels.map(label => <span key={label.name} className="inline-flex h-5 max-w-48 min-w-0 items-center rounded-md px-1.5 text-xs font-medium" style={label.color ? { background: `color-mix(in srgb, #${label.color} 18%, transparent)`, color: `color-mix(in srgb, #${label.color} 40%, var(--foreground))` } : undefined}><span className="truncate">{label.name}</span></span>)}{onAction && <CandidatePicker projectId={projectId} number={view.number} kind="labels" allowed={view.viewer.canUpdate} icon={<Tag className="size-3.5" />} onToggle={candidate => onAction({ type: "label", name: candidate.key, applied: !candidate.applied })} />}</span></MetaRow>}
		</section>
		<Section title="Description">
			{editingBody ? <MarkdownEditor value={view.body} label="Edit description" placeholder="Describe this pull request" allowEmpty saving={pending === "body"} projectId={projectId} repository={view.repository} onSave={body => void saveBody(body)} onCancel={() => setEditingBody(false)} />
				: <div className="group flex min-w-0 items-start gap-2">
					{view.body.trim() ? <PullRequestMarkdown className="min-w-0 flex-1" text={view.body} projectId={projectId} repository={view.repository} /> : <p className="min-w-0 flex-1 text-xs text-muted-foreground italic">No description provided.</p>}
					{onAction && canEditDescription(view) && <EditButton label="Edit description" onClick={() => setEditingBody(true)} />}
				</div>}
		</Section>
		<Section title="Checks" defaultOpen={false}>
			{checksStale ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><span>Check details are out of date.</span>{onRefresh && <Button size="xs" variant="ghost" onClick={onRefresh}>Refresh</Button>}</div>
				: view.checkRuns.length === 0 ? <p className="text-xs text-muted-foreground">No checks reported.</p> : view.checkRuns.map((check, index) => {
					const failing = check.status === "failure" || check.status === "cancelled";
					return <div key={`${index}:${check.name}:${check.url ?? ""}`} className="group flex items-center gap-2 rounded-md pr-1 hover:bg-accent/60">
						<button type="button" disabled={!check.url} onClick={() => check.url && onOpen(check.url)} className={cn("flex min-w-0 flex-1 items-start gap-2 rounded-md px-2 py-2 text-left text-xs leading-5 [&>svg]:mt-0.5", check.url ? "cursor-pointer" : "cursor-default")}>
							<CheckStatusIcon status={check.status} /><span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{check.name}</span><span className="shrink-0 text-muted-foreground">{checkStatusLabel(check)}</span>
						</button>
						{failing && <FixButton finding={{ kind: "check", check }} view={view} handoff={handoff} label={handoff?.labels.fixCheck} />}
						{check.url && <button type="button" className="shrink-0 text-xs text-primary hover:underline" onClick={() => onOpen(check.url!)}>Details</button>}
					</div>;
				})}
		</Section>
		<Section title={`Comments (${view.commentCount})`} actions={<div className="flex shrink-0 items-center gap-1">
			<DropdownMenu>
				<DropdownMenuTrigger render={<Button size="xs" variant="ghost" className="text-muted-foreground" aria-label="Filter comments" />}><ListFilter aria-hidden className="size-3" />{hiddenByFilter > 0 ? `${hiddenByFilter} hidden` : "Filter"}</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-52">
					<DropdownMenuGroup><DropdownMenuLabel>Show</DropdownMenuLabel>
						<DropdownMenuCheckboxItem checked={filter.bots} closeOnClick={false} onCheckedChange={bots => setFilter(value => ({ ...value, bots }))}>Bot comments</DropdownMenuCheckboxItem>
						<DropdownMenuCheckboxItem checked={filter.resolved} closeOnClick={false} onCheckedChange={resolved => setFilter(value => ({ ...value, resolved }))}>Resolved or dismissed</DropdownMenuCheckboxItem>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>
			<Button size="xs" variant="ghost" className="text-muted-foreground" aria-label={order === "newest" ? "Show oldest comments first" : "Show newest comments first"} onClick={() => setOrder(order === "newest" ? "oldest" : "newest")}><ArrowDownUp aria-hidden className="size-3" />{order === "newest" ? "Newest first" : "Oldest first"}</Button>
		</div>}>
			{view.commentsTruncated && <p className="mb-2 border-l-2 border-warning pl-2 text-xs">This conversation is longer than one read. The most recent {view.comments.length} are here; open it on GitHub to read the rest.</p>}
			{view.comments.length === 0 ? <p className="py-2 text-xs text-muted-foreground">No comments yet.</p>
				: filtered.length === 0 ? <p className="py-2 text-xs text-muted-foreground">{hiddenByFilter === 1 ? "The only comment is hidden by the filter." : `All ${hiddenByFilter} comments are hidden by the filter.`}</p>
				: <div className="space-y-3">{order === "oldest" && showOlder}{visible.map(comment => <CommentRow key={comment.id} comment={comment} actions={actions} onOpen={onOpen} editor={editor} />)}{order === "newest" && showOlder}{shown > PAGE && <Button size="sm" variant="ghost" className="w-full text-xs" onClick={() => setShown(PAGE)}>Show only {PAGE} recent comments</Button>}</div>}
		</Section>
		<div className="h-16" aria-hidden />
	</ScrollArea>;
}
