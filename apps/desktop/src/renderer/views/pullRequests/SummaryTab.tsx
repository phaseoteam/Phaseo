import { useState, type ReactNode } from "react";
import { ArrowDownUp, ChevronDown, ChevronRight, ListFilter, Tag, Users } from "lucide-react";
import type { PullRequestComment, PullRequestView } from "../../../shared/pullRequestView";
import { MessageContent } from "../../components/MessageContent";
import { Button } from "../../components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../components/ui/collapsible";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import { ScrollArea } from "../../components/ui/scroll-area";
import { usePersistedState } from "../../lib/persistedState";
import { cn } from "../../lib/utils";
import { ActorAvatar, ActorLabel, CheckStatusIcon, checkStatusLabel, REVIEW_OUTCOME_PRESENTATION, ReviewOutcomeLabel, reviewOutcomeStaleLabel, Tip } from "./presentation";
import { isBot, isFinished, reactionEmoji, relativeTime, reviewerEntries, reviewOutcome, visibleBody } from "./pullRequestLogic";

function MetaRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
	return <div className="grid min-h-6 min-w-0 grid-cols-[6rem_minmax(0,1fr)] items-center gap-2 text-xs"><span className="flex items-center gap-1.5 text-muted-foreground">{icon}{label}</span><span className="min-w-0 text-foreground">{children}</span></div>;
}

/** A collapsible section whose heading rides the top of the scroll box, so it folds from wherever it was read to. */
export function Section({ title, defaultOpen = true, actions, children }: { title: string; defaultOpen?: boolean; actions?: ReactNode; children: ReactNode }) {
	const [open, setOpen] = useState(defaultOpen);
	return <Collapsible open={open} onOpenChange={setOpen} render={<section aria-label={title} />}>
		<div className="sticky top-0 z-10 flex w-full items-center bg-background pr-4">
			<CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-1.5 px-4 py-3 text-left text-xs font-medium text-muted-foreground hover:text-foreground">
				<span>{title}</span><ChevronRight aria-hidden className={cn("size-3.5 text-muted-foreground/60 transition-transform", open && "rotate-90")} />
			</CollapsibleTrigger>
			{actions}
		</div>
		<CollapsibleContent><div className="px-4 pb-4">{children}</div></CollapsibleContent>
	</Collapsible>;
}

export function Reactions({ reactions }: { reactions: PullRequestComment["reactions"] }) {
	if (!reactions.length) return null;
	return <span className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1">{reactions.map(reaction => <span key={reaction.content} className="inline-flex h-5 items-center gap-1 rounded-full bg-muted/60 px-1.5 text-2xs tabular-nums text-muted-foreground" aria-label={`${reaction.count} ${reaction.content.toLowerCase().replaceAll("_", " ")}`}><span aria-hidden>{reactionEmoji[reaction.content] ?? "•"}</span>{reaction.count}</span>)}</span>;
}

function CommentIdentity({ comment, onOpen }: { comment: PullRequestComment; onOpen: (url: string) => void }) {
	return <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
		<ActorLabel actor={comment.author} className="max-w-full" />
		<Tip label={`${new Date(comment.createdAt).toLocaleString()}${comment.url ? " · Open comment on GitHub" : ""}`}>
			{comment.url ? <button type="button" onClick={() => onOpen(comment.url!)} className="text-muted-foreground hover:text-foreground hover:underline"><time dateTime={comment.createdAt}>{relativeTime(comment.createdAt)}</time></button> : <span className="text-muted-foreground"><time dateTime={comment.createdAt}>{relativeTime(comment.createdAt)}</time></span>}
		</Tip>
	</div>;
}
function CommentLocation({ comment, view }: { comment: PullRequestComment; view: PullRequestView }) {
	const thread = comment.threadId ? view.threads.find(value => value.id === comment.threadId) : undefined, path = thread?.path ?? comment.path;
	if (!path) return null;
	const label = `${path}${thread?.line ? `:${thread.line}` : ""}`;
	return <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground"><span className="truncate font-mono">{label}</span>{thread?.outdated && <span className="shrink-0">Outdated</span>}</div>;
}
/** Flat rows with a left rule rather than T3's bordered cards. */
function CommentRow({ comment, view, projectId, onOpen }: { comment: PullRequestComment; view: PullRequestView; projectId: string; onOpen: (url: string) => void }) {
	const outcome = reviewOutcome(comment.reviewState), body = visibleBody(comment.body);
	const [open, setOpen] = useState(false);
	if (isFinished(comment, view.threads)) {
		const resolved = view.threads.find(thread => thread.id === comment.threadId)?.resolved;
		return <Collapsible open={open} onOpenChange={setOpen} render={<article className="border-l-2 border-border/60 py-1 pl-3" data-comment-id={comment.id} />}>
			<div className="flex flex-wrap items-start gap-2"><CommentIdentity comment={comment} onOpen={onOpen} />
				<CollapsibleTrigger className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground">{resolved ? "Resolved" : "Review dismissed"}<ChevronDown aria-hidden className={cn("size-3.5 transition-transform", open && "rotate-180")} /></CollapsibleTrigger>
				<Reactions reactions={comment.reactions} />
			</div>
			<CommentLocation comment={comment} view={view} />
			{!open && body && <p className="mt-1 truncate text-xs text-muted-foreground">{body.replace(/<!--[\s\S]*?-->/g, "").replace(/[*`#>]/g, "").replace(/\s+/g, " ").trim()}</p>}
			<CollapsibleContent>{body && <div className="pr-comment-body mt-2 text-xs"><MessageContent text={body} projectId={projectId} /></div>}</CollapsibleContent>
		</Collapsible>;
	}
	return <article className="border-l-2 border-border/60 py-1 pl-3" data-comment-id={comment.id}>
		<div className="flex flex-wrap items-start gap-2">
			<div className="flex min-w-0 flex-1 flex-wrap items-center gap-2"><CommentIdentity comment={comment} onOpen={onOpen} />{outcome ? <ReviewOutcomeLabel outcome={outcome} /> : comment.reviewState && comment.reviewState !== "COMMENTED" ? <span className="text-xs text-muted-foreground">{comment.reviewState.charAt(0) + comment.reviewState.slice(1).toLowerCase().replaceAll("_", " ")}</span> : null}</div>
			<Reactions reactions={comment.reactions} />
		</div>
		<CommentLocation comment={comment} view={view} />
		{body && <div className="pr-comment-body mt-2 min-w-0 text-xs"><MessageContent text={body} projectId={projectId} /></div>}
	</article>;
}

const PAGE = 10;
export function SummaryTab({ view, projectId, onOpen, onScrollerRef }: { view: PullRequestView; projectId: string; onOpen: (url: string) => void; onScrollerRef?: (node: HTMLDivElement | null) => void }) {
	const [filter, setFilter] = usePersistedState("phaseo.desktop.pullRequestCommentFilter", { bots: false, resolved: false });
	const [order, setOrder] = useState<"newest" | "oldest">("newest");
	const [shown, setShown] = useState(PAGE);
	const filtered = view.comments.filter(comment => (filter.bots || !isBot(comment)) && (filter.resolved || !isFinished(comment, view.threads)));
	const hiddenByFilter = view.comments.length - filtered.length;
	const recent = filtered.slice(Math.max(0, filtered.length - shown)), older = filtered.length - recent.length;
	const visible = order === "newest" ? [...recent].reverse() : recent;
	const reviewers = reviewerEntries(view);
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
			</MetaRow>
			{view.labels.length > 0 && <MetaRow icon={<Tag className="size-3.5" />} label="Labels"><span className="flex min-w-0 flex-wrap items-center gap-1">{view.labels.map(label => <span key={label.name} className="inline-flex h-5 max-w-48 min-w-0 items-center rounded-md px-1.5 text-xs font-medium" style={label.color ? { background: `color-mix(in srgb, #${label.color} 18%, transparent)`, color: `color-mix(in srgb, #${label.color} 40%, var(--foreground))` } : undefined}><span className="truncate">{label.name}</span></span>)}</span></MetaRow>}
		</section>
		<Section title="Description">
			<div className="pr-comment-body min-w-0 text-xs">{view.body.trim() ? <MessageContent text={view.body} projectId={projectId} /> : <p className="text-muted-foreground italic">No description provided.</p>}</div>
		</Section>
		<Section title="Checks" defaultOpen={false}>
			{view.checkRuns.length === 0 ? <p className="text-xs text-muted-foreground">No checks reported.</p> : view.checkRuns.map((check, index) => <div key={`${index}:${check.name}`} className="flex items-center gap-2 rounded-md pr-1 hover:bg-accent/60">
				<button type="button" disabled={!check.url} onClick={() => check.url && onOpen(check.url)} className={cn("flex min-w-0 flex-1 items-start gap-2 rounded-md px-2 py-2 text-left text-xs leading-5 [&>svg]:mt-0.5", check.url ? "cursor-pointer" : "cursor-default")}>
					<CheckStatusIcon status={check.status} /><span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{check.name}</span><span className="shrink-0 text-muted-foreground">{checkStatusLabel(check)}</span>
				</button>
				{check.url && <button type="button" className="shrink-0 text-xs text-primary hover:underline" onClick={() => onOpen(check.url!)}>Details</button>}
			</div>)}
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
				: <div className="space-y-3">{order === "oldest" && showOlder}{visible.map(comment => <CommentRow key={comment.id} comment={comment} view={view} projectId={projectId} onOpen={onOpen} />)}{order === "newest" && showOlder}{shown > PAGE && <Button size="sm" variant="ghost" className="w-full text-xs" onClick={() => setShown(PAGE)}>Show only {PAGE} recent comments</Button>}</div>}
		</Section>
		<div className="h-16" aria-hidden />
	</ScrollArea>;
}
