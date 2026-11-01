import { formatRelativeTime } from "@phaseo/app-kit/format";
import { createContext, useContext, useState, type ReactNode } from "react";
import { ChevronDown, ExternalLink, FileCode2, GitCommitHorizontal, MessageSquare } from "lucide-react";
import type { PullRequestAction, PullRequestActor, PullRequestView } from "../../../shared/pullRequestView";
import { Button } from "../../components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../components/ui/collapsible";
import { ScrollArea } from "../../components/ui/scroll-area";
import { cn } from "../../lib/utils";
import { ActorAvatar, DiffStat, MetaLine, PullRequestGlyph, REVIEW_OUTCOME_PRESENTATION, ReviewOutcomeIcon, reviewOutcomeStaleLabel, Tip } from "./presentation";
import { buildTimeline, groupTimeline, isVerdictStale, newestCommitAt, reviewOutcome, type ReviewOutcome, type TimelineEvent } from "./pullRequestLogic";
import { PullRequestCommentBody } from "./PullRequestMarkdown";
import { Reactions, useCommentEditor } from "./SummaryTab";

/** What every row needs to draw a body and edit its comment, without threading it through each one. */
const TimelineContext = createContext<{ view: PullRequestView; projectId: string; editor: ReturnType<typeof useCommentEditor> } | undefined>(undefined);

function Marker({ children, className }: { children: ReactNode; className?: string }) {
	return <span className={cn("absolute top-1/2 left-0 z-10 flex size-8 -translate-y-1/2 items-center justify-center bg-background", className)}>{children}</span>;
}
function IconMarker({ icon, className }: { icon: ReactNode; className?: string }) {
	return <Marker className={className}><span className="flex size-7 items-center justify-center bg-background text-muted-foreground">{icon}</span></Marker>;
}
function ActorMarker({ actors, fallback, className, muted = false }: { actors: PullRequestActor[]; fallback: ReactNode; className?: string; muted?: boolean }) {
	return actors[0] ? <Marker className={className}><ActorAvatar actor={actors[0]} className={cn("size-7 bg-muted text-3xs transition-opacity", muted && "opacity-45 grayscale")} /></Marker> : <IconMarker className={className} icon={fallback} />;
}
const ActorName = ({ actor }: { actor: PullRequestActor | null }) => <span className="font-semibold text-foreground">{actor?.login ?? "ghost"}</span>;
function OpenButton({ url, onOpen }: { url?: string; onOpen: (url: string) => void }) {
	return url ? <Button size="icon-xs" variant="ghost" className="-mt-1 -mr-1 shrink-0 text-muted-foreground" aria-label="Open activity on GitHub" onClick={() => onOpen(url)}><ExternalLink className="size-3" /></Button> : null;
}
function Body({ id, body }: { id: string; body: string | null }) {
	const context = useContext(TimelineContext)!, comment = context.view.comments.find(value => value.id === id);
	if (comment && context.editor.editing === id) return <div className="mt-3">{context.editor.editor(comment, context.projectId)}</div>;
	return body ? <div className="mt-3"><PullRequestCommentBody text={body} projectId={context.projectId} repository={context.view.repository} /></div> : null;
}
function Edit({ id }: { id: string }) {
	const context = useContext(TimelineContext)!, comment = context.view.comments.find(value => value.id === id);
	return comment ? context.editor.button(comment) : null;
}

function ConversationRow({ event, onOpen }: { event: TimelineEvent; onOpen: (url: string) => void }) {
	return <article className="group py-2"><div className="flex min-w-0 flex-wrap items-start gap-2 px-2">
		<div className="min-w-0 flex-1">
			<div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs"><ActorName actor={event.actor} /><span className="text-muted-foreground">{event.title}</span></div>
			<MetaLine className="mt-1 flex-wrap text-2xs text-muted-foreground"><span>{formatRelativeTime(event.at)}</span>{event.path && <span className="inline-flex min-w-0 items-center gap-1"><FileCode2 aria-hidden className="size-3 shrink-0" /><span className="truncate">{event.path}</span></span>}</MetaLine>
		</div>
		<Edit id={event.id} /><Reactions reactions={event.reactions} subjectId={event.canReact ? event.id : undefined} canReact={event.canReact} /><OpenButton url={event.url} onOpen={onOpen} />
	</div><div className="px-2"><Body id={event.id} body={event.body} /></div></article>;
}
function ConversationGroup({ events, onOpen }: { events: TimelineEvent[]; onOpen: (url: string) => void }) {
	const [open, setOpen] = useState(false);
	const actors = [...new Map(events.flatMap(event => event.actor ? [[event.actor.login, event.actor] as const] : [])).values()];
	return <div className="relative mb-5 pl-12">
		<ActorMarker actors={actors} className="top-6" fallback={<MessageSquare className="size-3.5" />} muted={!open} />
		<Collapsible open={open} onOpenChange={setOpen}>
			<CollapsibleTrigger className={cn("flex w-full min-w-0 items-center gap-3 py-2 text-left transition-opacity hover:opacity-100", open ? "text-foreground opacity-100" : "text-muted-foreground opacity-55")}>
				<span className="min-w-0 flex-1"><span className="block text-xs font-semibold">{events.length} {events.length === 1 ? "comment" : "comments"}</span><span className="block truncate text-3xs text-muted-foreground">{actors.length} {actors.length === 1 ? "author" : "authors"} · {formatRelativeTime(events[0].at)}</span></span>
				<ChevronDown aria-hidden className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
			</CollapsibleTrigger>
			<CollapsibleContent><div className="mt-1 space-y-1">{events.map(event => <ConversationRow key={event.id} event={event} onOpen={onOpen} />)}</div></CollapsibleContent>
		</Collapsible>
	</div>;
}
/** A commit row is a button that opens the Code tab scoped to that commit. */
function CommitRow({ event, onView }: { event: TimelineEvent; onView?: (oid: string) => void }) {
	return <button type="button" disabled={!onView} aria-label={`View commit ${event.id.slice(0, 7)}`} onClick={() => onView?.(event.id)} className="group relative mb-5 block w-full cursor-pointer rounded-sm pl-12 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-default">
		<ActorMarker actors={event.commitAuthors} fallback={<GitCommitHorizontal className="size-3.5" />} />
		<div className="flex min-w-0 items-center gap-2.5 py-1.5"><div className="min-w-0 flex-1">
			<div className="truncate text-xs font-semibold text-foreground transition-colors group-hover:text-primary">{event.body ?? "Untitled commit"}</div>
			<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-3xs text-muted-foreground"><code className="font-mono">{event.id.slice(0, 7)}</code><span>{formatRelativeTime(event.at)}</span></div>
		</div>{event.additions !== undefined && event.deletions !== undefined && <DiffStat additions={event.additions} deletions={event.deletions} className="ml-auto shrink-0 font-mono text-3xs" />}</div>
	</button>;
}
function LifecycleRow({ event }: { event: TimelineEvent }) {
	const presentation = event.kind === "opened" ? { icon: <PullRequestGlyph.pullRequest className="size-3.5" />, label: "Pull request opened" } : event.kind === "merged" ? { icon: <PullRequestGlyph.merged className="size-3.5" />, label: "Pull request merged" } : { icon: <PullRequestGlyph.closed className="size-3.5" />, label: "Pull request closed" };
	return <div className="relative mb-5 pl-12"><IconMarker icon={presentation.icon} /><div className="py-1.5 text-xs"><div className="flex flex-wrap items-center gap-1.5">{event.actor && <ActorName actor={event.actor} />}<span className="font-semibold text-foreground">{presentation.label}</span></div><div className="mt-0.5 text-2xs text-muted-foreground">{formatRelativeTime(event.at)}</div></div></div>;
}
function VerdictRow({ event, outcome, stale, onOpen }: { event: TimelineEvent; outcome: ReviewOutcome; stale: boolean; onOpen: (url: string) => void }) {
	const label = REVIEW_OUTCOME_PRESENTATION[outcome].label;
	return <div className="group relative mb-5 pl-12">
		<ActorMarker actors={event.actor ? [event.actor] : []} className="top-6" fallback={<ReviewOutcomeIcon outcome={outcome} />} />
		<div className="flex min-w-0 flex-wrap items-start gap-2 py-1.5"><div className="min-w-0 flex-1">
			<div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs"><ActorName actor={event.actor} />
				{stale ? <Tip label={reviewOutcomeStaleLabel(outcome)}><span className="font-medium text-muted-foreground lowercase opacity-70">{label}<span className="sr-only">, before the latest commits</span></span></Tip> : <span className={cn("font-medium lowercase", REVIEW_OUTCOME_PRESENTATION[outcome].toneClassName)}>{label}</span>}
			</div>
			<MetaLine className="mt-0.5 flex-wrap text-2xs text-muted-foreground"><span>{formatRelativeTime(event.at)}</span>{event.path && <span className="inline-flex min-w-0 items-center gap-1"><FileCode2 aria-hidden className="size-3 shrink-0" /><span className="truncate">{event.path}</span></span>}</MetaLine>
		</div><Edit id={event.id} /><Reactions reactions={event.reactions} subjectId={event.canReact ? event.id : undefined} canReact={event.canReact} /><OpenButton url={event.url} onOpen={onOpen} /></div>
		<Body id={event.id} body={event.body} />
	</div>;
}

/** The vertical rail: lifecycle, commits, verdicts and folded runs of comments. */
export function TimelineTab({ view, projectId, order, onOpen, onScrollerRef, onAction, onViewCommit }: { view: PullRequestView; projectId: string; order: "newest" | "oldest"; onOpen: (url: string) => void; onScrollerRef?: (node: HTMLDivElement | null) => void; onAction?: (action: PullRequestAction) => Promise<boolean>; pending?: PullRequestAction["type"]; onViewCommit?: (oid: string) => void }) {
	const editor = useCommentEditor({ view, onAction });
	const events = buildTimeline(view), newest = newestCommitAt(view.commits);
	const rows = groupTimeline(order === "newest" ? events : [...events].reverse());
	return <TimelineContext value={{ view, projectId, editor }}><ScrollArea className="h-full" viewportRef={onScrollerRef} viewportClassName="pr-scroller">
		<div className="mx-auto max-w-3xl px-4 pt-5 pb-16"><div className="relative" aria-label="Pull request timeline">
			<span aria-hidden className="absolute top-1 bottom-5 left-[15px] w-px bg-border/45" />
			{rows.map(row => {
				if (row.kind === "comments") return <ConversationGroup key={`comments:${row.events[0].id}`} events={row.events} onOpen={onOpen} />;
				const event = row.event;
				if (event.kind === "commit") return <CommitRow key={event.id} event={event} onView={onViewCommit} />;
				const outcome = reviewOutcome(event.reviewState);
				if (outcome) return <VerdictRow key={event.id} event={event} outcome={outcome} stale={isVerdictStale(event.at, newest)} onOpen={onOpen} />;
				return <LifecycleRow key={event.id} event={event} />;
			})}
			{events.every(event => event.kind === "opened") && <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground"><PullRequestGlyph.pullRequest aria-hidden className="mb-2 size-5" /><p className="text-xs">No activity yet.</p></div>}
		</div></div>
	</ScrollArea></TimelineContext>;
}
