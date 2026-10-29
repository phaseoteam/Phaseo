import { ArrowUpRight, Check, CircleCheck, CircleDot, CircleSlash, Eye, FileCode2, GitCommitHorizontal, GitMerge, GitPullRequestDraft, Link2, MessageSquare, Pencil, Tag, TriangleAlert, Upload, UserRound, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { FactorySnapshot, IssueComment, TimelineComment, TimelineEntry, TimelineEventIcon, WorkItem } from "../../../shared/types";
import { errorText } from "../../components/AddRepo";
import { LabelChip } from "../../components/LabelChip";
import { MERGED, PersonMark } from "../../components/Marks";
import { Markdown } from "../../components/Markdown";
import { Button } from "../../components/ui/button";
import { formatRelativeTime } from "@phaseo/app-kit/format";
import { factory, href } from "../../lib/useFactory";
import { cn } from "../../lib/utils";

/** While an item is open and the window can be seen, its activity is read again this often, so new comments show without waiting for the next check. */
const ACTIVITY_EVERY = 20_000;

/** Everything that happened on an item, read from GitHub when it opens, whenever it changes there, and every little while it's open. */
export function useTimeline(item: WorkItem): { entries: TimelineEntry[] | null; comments: IssueComment[] | null; error: string | null } {
	const [state, setState] = useState<{ key: string; entries: TimelineEntry[] | null; error: string | null }>({ key: "", entries: null, error: null });
	const [tick, setTick] = useState(0);
	const key = `${item.id}@${item.updatedAt}`;
	useEffect(() => {
		let current = true;
		void factory().itemTimeline(item.id)
			.then((entries) => current && setState((previous) => {
				// Nothing new: keep the same list, so nothing re-renders.
				const same = previous.key === key && JSON.stringify(previous.entries) === JSON.stringify(entries);
				return same ? previous : { key, entries, error: null };
			}))
			.catch((cause: unknown) => current && setState((previous) => (previous.entries && tick ? previous : { key, entries: null, error: errorText(cause) })));
		return () => {
			current = false;
		};
	}, [item.id, key, tick]);
	useEffect(() => {
		const again = () => document.visibilityState === "visible" && setTick((count) => count + 1);
		const timer = setInterval(again, ACTIVITY_EVERY);
		// Coming back to the window reads it at once.
		document.addEventListener("visibilitychange", again);
		return () => {
			clearInterval(timer);
			document.removeEventListener("visibilitychange", again);
		};
	}, [item.id]);
	// Until the new read lands, the last one stays up rather than flashing empty.
	const entries = state.key.startsWith(`${item.id}@`) ? state.entries : null;
	const comments = entries?.filter((entry): entry is Extract<TimelineEntry, { kind: "comment" }> => entry.kind === "comment").map(({ author, avatar, body, at, url, factory: fromFactory }) => ({ author, avatar, body, at, url, factory: fromFactory })) ?? null;
	return { entries, comments, error: state.key.startsWith(`${item.id}@`) ? state.error : null };
}

/** A comment, which its author can edit or delete here. `inline`: one on a line of code. */
export function CommentEntry({ comment, item, inline, compact }: { comment: TimelineComment; item: WorkItem; inline?: boolean; compact?: boolean }) {
	const [editing, setEditing] = useState<string | null>(null);
	const [asking, setAsking] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		if (!asking) return;
		const timer = setTimeout(() => setAsking(false), 5_000);
		return () => clearTimeout(timer);
	}, [asking]);
	const run = async (change: Parameters<ReturnType<typeof factory>["changeOnGithub"]>[1]) => {
		setBusy(true);
		setError(null);
		try {
			await factory().changeOnGithub(item.id, change);
			setEditing(null);
		} catch (cause) {
			setError(errorText(cause));
		} finally {
			setBusy(false);
		}
	};
	const id = comment.databaseId;
	return <article className={compact ? "py-2" : "py-4"}>
		<div className="mb-2 flex items-center gap-2 text-xs">
			<PersonMark login={comment.author} avatar={comment.avatar} className={compact ? "size-4" : "size-5"} />
			<span className="font-medium">{comment.author}</span>
			{comment.factory && <span className="rounded-[4px] border px-1.5 text-2xs text-muted-foreground">Factory</span>}
			<span className="text-muted-foreground">{formatRelativeTime(comment.at)}</span>
			<span className="flex-1" />
			{id && comment.canEdit && editing === null && <button type="button" onClick={() => setEditing(comment.body)} className="text-muted-foreground hover:text-foreground">Edit</button>}
			{id && comment.canDelete && editing === null && <button type="button" disabled={busy} onClick={() => (asking ? void run({ kind: "delete-comment", commentId: id, inline }) : setAsking(true))} className={cn("hover:text-foreground", asking ? "font-medium text-destructive" : "text-muted-foreground")}>{busy ? "Deleting…" : asking ? "Delete it? Click again" : "Delete"}</button>}
			{comment.url && <button type="button" onClick={() => void factory().openExternal(comment.url!)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">On GitHub<ArrowUpRight className="size-3" /></button>}
		</div>
		{editing === null
			? <Markdown source={comment.body.trim() || "_Empty comment._"} repo={item.repo} />
			: <div className="rounded-md border focus-within:border-ring">
				<textarea value={editing} autoFocus rows={Math.min(14, Math.max(3, editing.split("\n").length))} onChange={(event) => setEditing(event.target.value)} className="block w-full resize-none bg-transparent px-3 py-2.5 text-sm leading-relaxed outline-none" />
				<div className="flex justify-end gap-2 border-t px-2 py-2">
					<Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
					<Button size="sm" disabled={busy || !editing.trim() || editing === comment.body || !id} onClick={() => id && void run({ kind: "edit-comment", commentId: id, inline, body: editing })}>{busy ? "Saving…" : "Save"}</Button>
				</div>
			</div>}
		{error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
	</article>;
}

const REVIEW = {
	approved: { icon: Check, className: "text-success", text: "approved these changes" },
	changes: { icon: TriangleAlert, className: "text-warning", text: "requested changes" },
	commented: { icon: Eye, className: "text-muted-foreground", text: "reviewed" },
	dismissed: { icon: CircleSlash, className: "text-muted-foreground", text: "left a review that was dismissed" },
} as const;

function ReviewEntry({ review, item }: { review: Extract<TimelineEntry, { kind: "review" }>; item: WorkItem }) {
	const look = REVIEW[review.state];
	const Icon = look.icon;
	return <article className="py-4">
		<div className="mb-2 flex items-center gap-2 text-xs">
			<span className={cn("grid size-5 place-items-center", look.className)}><Icon className="size-4" /></span>
			<PersonMark login={review.author} avatar={review.avatar} className="size-5" />
			<span><span className="font-medium">{review.author}</span> <span className="text-muted-foreground">{look.text}</span></span>
			<span className="text-muted-foreground">{formatRelativeTime(review.at)}</span>
			<span className="flex-1" />
			{review.url && <button type="button" onClick={() => void factory().openExternal(review.url!)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">On GitHub<ArrowUpRight className="size-3" /></button>}
		</div>
		{review.body.trim() && <div className="pl-7"><Markdown source={review.body} repo={item.repo} /></div>}
		{review.comments.length > 0 && <div className="mt-3 ml-7 divide-y rounded-md border">
			{review.comments.map((comment) => <div key={comment.id} className="px-3">
				<a href={href({ page: "work", item: item.id, tab: "files" })} className="flex items-center gap-1.5 pt-2.5 font-mono text-2xs text-muted-foreground hover:text-foreground hover:underline">
					<FileCode2 className="size-3" />{comment.path}{comment.line ? `:${comment.line}` : ""}
				</a>
				<CommentEntry comment={comment} item={item} inline compact />
			</div>)}
		</div>}
	</article>;
}

const EVENT: Record<TimelineEventIcon, { icon: LucideIcon; className?: string }> = {
	closed: { icon: CircleCheck, className: MERGED },
	skipped: { icon: CircleSlash },
	reopened: { icon: CircleDot, className: "text-success" },
	merged: { icon: GitMerge, className: MERGED },
	label: { icon: Tag },
	person: { icon: UserRound },
	edit: { icon: Pencil },
	reference: { icon: Link2 },
	review: { icon: Eye },
	ready: { icon: CircleDot, className: "text-success" },
	draft: { icon: GitPullRequestDraft },
	push: { icon: Upload },
	commit: { icon: GitCommitHorizontal },
};

function EventEntry({ event, item, snapshot }: { event: Extract<TimelineEntry, { kind: "event" }>; item: WorkItem; snapshot: FactorySnapshot }) {
	const look = EVENT[event.icon];
	const Icon = look.icon;
	const target = event.ref && snapshot.items.find((candidate) => candidate.repo === event.ref!.repo && candidate.number === event.ref!.number);
	return <div className="flex min-w-0 items-center gap-2 py-1.5 text-xs text-muted-foreground">
		<span className={cn("grid size-5 shrink-0 place-items-center", look.className)}><Icon className="size-3.5" /></span>
		{event.actor && <PersonMark login={event.actor} avatar={event.avatar} className="size-4" />}
		<span className="min-w-0 truncate">
			{event.actor && <span className="font-medium text-foreground">{event.actor} </span>}
			{event.commit
				? <><span className="font-mono text-foreground/80">{event.commit}</span> {event.text}</>
				: event.label
					? <>{event.text.replace(` ${event.label} label`, "")} <LabelChip name={event.label} color={item.labelColors?.[event.label]} className="align-middle" /> label</>
					: event.text}
			{event.ref && <> {target
				? <a href={href({ page: "work", item: target.id })} className="text-foreground hover:underline">#{event.ref.number} {event.ref.title}</a>
				: <button type="button" onClick={() => void factory().openExternal(`https://github.com/${event.ref!.repo}/${event.ref!.pull ? "pull" : "issues"}/${event.ref!.number}`)} className="text-foreground hover:underline">{event.ref.repo === item.repo ? "" : event.ref.repo}#{event.ref.number} {event.ref.title}</button>}</>}
		</span>
		<span className="shrink-0">{formatRelativeTime(event.at)}</span>
	</div>;
}

/** The whole history, newest first: what changed last is what you came to see. */
export function TimelineView({ entries, item, snapshot }: { entries: TimelineEntry[]; item: WorkItem; snapshot: FactorySnapshot }) {
	if (!entries.length) return <p className="py-10 text-center text-sm text-muted-foreground"><MessageSquare className="mx-auto mb-2 size-5 opacity-60" />Nothing has happened here yet.</p>;
	const newest = [...entries].reverse();
	return <div>
		{newest.map((entry, index) => {
			// Events sit close together; a comment or review gets a rule above it.
			const ruled = entry.kind !== "event" && index > 0;
			const key = entry.kind === "event" ? `${entry.icon}-${entry.at}-${entry.commit ?? entry.text}` : entry.id;
			return <div key={key} className={cn(ruled && "border-t", entry.kind !== "event" && newest[index + 1]?.kind === "event" && "border-b")}>
				{entry.kind === "comment" ? <CommentEntry comment={entry} item={item} /> : entry.kind === "review" ? <ReviewEntry review={entry} item={item} /> : <EventEntry event={entry} item={item} snapshot={snapshot} />}
			</div>;
		})}
	</div>;
}
