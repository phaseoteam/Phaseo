import { useRef, useState, type ReactNode } from "react";
import { Check, CircleX, MessageSquare, Send, Trash2, X } from "lucide-react";
import type { PullRequestAction, PullRequestView } from "../../../shared/pullRequestView";
import { Select } from "../../components/Select";
import { Button } from "../../components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { Textarea } from "../../components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import { PullRequestGlyph, Tip } from "./presentation";
import { pullRequestReviewKey, reviewDrafts, usePendingReviewComments, useReviewDrafts } from "./pullRequestReviewStore";
import { segmentedGroup, segmentedItem } from "./segmented";

type Verdict = Extract<PullRequestAction, { type: "review" }>["event"];
const verdicts: { value: Verdict; label: string; icon: ReactNode }[] = [
	{ value: "comment", label: "Comment", icon: <MessageSquare aria-hidden className="size-3" /> },
	{ value: "approve", label: "Approve", icon: <Check aria-hidden className="size-3" /> },
	{ value: "request-changes", label: "Request changes", icon: <CircleX aria-hidden className="size-3" /> },
];

/** GitHub wants words with a change request, and a comment review needs words or line comments. */
export function canSubmitReview(verdict: Verdict, summary: string, comments: number) { return verdict === "request-changes" ? summary.trim().length > 0 : verdict === "approve" || summary.trim().length > 0 || comments > 0; }
/** The placeholder asks for exactly what the submit button is waiting on. */
export function reviewPlaceholder(verdict: Verdict, comments: number) {
	if (canSubmitReview(verdict, "", comments)) return "Summarise your review (optional)";
	return verdict === "request-changes" ? "Summarise your review (required to request changes)" : "Summarise your review or add line comments";
}

/**
 * The floating composer: a comment on the conversation (optionally the one that closes or reopens it) or a review
 * carrying the Code tab's line comments and a verdict. Opening it picks the mode with work waiting in it. Both drafts
 * live in the review store, so they survive closing it, switching tabs and leaving the pane.
 */
export function Composer({ view, projectId, pending, onAction, openReviewRequest }: { view: PullRequestView; projectId: string; pending: PullRequestAction["type"] | undefined; onAction: (action: PullRequestAction) => Promise<boolean>; openReviewRequest?: number }) {
	const key = pullRequestReviewKey(projectId, view.repository, view.number);
	const comments = usePendingReviewComments(key);
	const summary = useReviewDrafts(state => state.summaries[key] ?? ""), comment = useReviewDrafts(state => state.comments[key] ?? "");
	const [open, setOpen] = useState(false), [requested, setRequested] = useState<"comment" | "review">("comment");
	const [requestedVerdict, setVerdict] = useState<Verdict>("comment"), [submitting, setSubmitting] = useState<"comment" | "close" | "reopen" | "review">();
	const commentRef = useRef<HTMLTextAreaElement>(null), reviewRef = useRef<HTMLTextAreaElement>(null);
	const [answered, setAnswered] = useState(openReviewRequest);
	if (openReviewRequest !== answered) { setAnswered(openReviewRequest); setRequested("review"); setOpen(true); }
	// GitHub does not let authors approve or request changes on their own pull request.
	const own = !!view.viewer.login && view.viewer.login.toLowerCase() === view.author.toLowerCase();
	const offered = own ? verdicts.filter(value => value.value === "comment") : verdicts;
	const verdict = offered.find(value => value.value === requestedVerdict)?.value ?? "comment";
	const reviewStarted = comments.length > 0 || summary.trim().length > 0;
	const mode = requested;
	const followUp = view.viewer.canUpdate ? view.state === "OPEN" ? "close" as const : view.state === "CLOSED" ? "reopen" as const : null : null;
	const busy = submitting !== undefined || pending !== undefined;

	const submitComment = async (then?: "close" | "reopen") => {
		const body = comment.trim();
		if (!body || busy) return;
		setSubmitting(then ?? "comment");
		const done = await onAction({ type: "comment", body: comment, ...(then ? { then } : {}) });
		setSubmitting(undefined);
		if (done) { reviewDrafts.clearComment(key, comment); setOpen(false); }
	};
	const submitReview = async () => {
		if (busy || !canSubmitReview(verdict, summary, comments.length)) return;
		const sentSummary = summary, sentComments = comments;
		setSubmitting("review");
		const done = await onAction({ type: "review", event: verdict, body: sentSummary, ...(sentComments.length ? { comments: sentComments.map(entry => ({ path: entry.path, line: entry.line, side: entry.side, ...(entry.startLine ? { startLine: entry.startLine, startSide: entry.startSide } : {}), body: entry.body })) } : {}) });
		setSubmitting(undefined);
		// Remarks added while GitHub was accepting this snapshot stay for the next review, as does a revised summary.
		if (done) { reviewDrafts.removeComments(key, sentComments.map(entry => entry.id)); reviewDrafts.clearSummary(key, sentSummary); setVerdict("comment"); setOpen(false); }
	};
	const label = comments.length ? `Review pull request, ${comments.length} ${comments.length === 1 ? "comment" : "comments"} pending` : reviewStarted ? "Review pull request" : "Comment on pull request";

	return <Popover open={open} onOpenChange={next => { if (next) setRequested(reviewStarted ? "review" : "comment"); setOpen(next); }}>
		<Tip label={label}><PopoverTrigger render={<Button size="icon" variant="outline" className="relative rounded-full border-border/60 bg-background/80 text-foreground shadow-sm backdrop-blur-md hover:border-border hover:bg-background" aria-label={label} data-pull-request-composer="" />}>
			<MessageSquare className="size-4" />
			{comments.length > 0 && <span aria-hidden className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-info px-1 text-3xs font-semibold text-white tabular-nums">{comments.length}</span>}
		</PopoverTrigger></Tip>
		<PopoverContent side="top" align="end" sideOffset={8} className="w-96 gap-3 p-3" aria-label="Pull request composer" initialFocus={mode === "review" ? reviewRef : commentRef}>
			<div className="flex items-center justify-between gap-2">
				<ToggleGroup aria-label="Composer mode" value={mode} onValueChange={(value: string) => { if (value === "comment" || value === "review") setRequested(value); }} spacing={0.5} className={segmentedGroup}>
					<ToggleGroupItem value="comment" className={segmentedItem}>Comment</ToggleGroupItem>
					<ToggleGroupItem value="review" className={segmentedItem}>{comments.length ? `Review (${comments.length})` : "Review"}</ToggleGroupItem>
				</ToggleGroup>
				<div className="flex items-center gap-1">
					{mode === "review" && comments.length > 0 && <Tip label="Discard pending line comments"><Button size="icon-xs" variant="ghost" aria-label="Discard pending line comments" disabled={submitting === "review"} onClick={() => reviewDrafts.clear(key)}><Trash2 className="size-3.5" /></Button></Tip>}
					<Button size="icon-xs" variant="ghost" aria-label="Close composer" onClick={() => setOpen(false)}><X className="size-3.5" /></Button>
				</div>
			</div>
			{mode === "comment" ? <div className="space-y-2">
				{/* Locked while posting: the box is cleared on success, which would throw away a draft typed meanwhile. */}
				<Textarea ref={commentRef} value={comment} disabled={busy} rows={3} onChange={event => reviewDrafts.setComment(key, event.target.value)} placeholder="Leave a comment" aria-label="Comment on this pull request" className="min-h-20 text-xs"
					onKeyDown={event => { if (event.nativeEvent.isComposing) return; if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) { event.preventDefault(); event.stopPropagation(); if (!event.repeat) void submitComment(); } }} />
				<div className="flex flex-wrap justify-end gap-2">
					{followUp && <Button size="xs" variant={followUp === "close" ? "destructive" : "outline"} disabled={!comment.trim() || busy} onClick={() => void submitComment(followUp)}>
						{followUp === "close" ? <PullRequestGlyph.closed className="size-3.5" /> : <PullRequestGlyph.reopen className="size-3.5" />}
						{submitting === followUp ? (followUp === "close" ? "Closing…" : "Reopening…") : followUp === "close" ? "Close with comment" : "Reopen with comment"}
					</Button>}
					<Button size="xs" variant="outline" disabled={!comment.trim() || busy} onClick={() => void submitComment()}><Send className="size-3.5" />{submitting === "comment" ? "Posting…" : "Comment"}</Button>
				</div>
			</div> : <div className="space-y-2">
				<Textarea ref={reviewRef} value={summary} rows={3} onChange={event => reviewDrafts.setSummary(key, event.target.value)} placeholder={reviewPlaceholder(verdict, comments.length)} aria-label="Review summary" className="min-h-20 text-xs" />
				<div className="flex items-center justify-end gap-2">
					{offered.length > 1 && <span className="mr-auto"><Select label="Review verdict" value={verdict} disabled={submitting === "review"} onValueChange={value => setVerdict(value as Verdict)} options={offered} /></span>}
					<Button size="xs" disabled={busy || !canSubmitReview(verdict, summary, comments.length)} onClick={() => void submitReview()}>{submitting === "review" ? "Submitting…" : "Submit review"}</Button>
				</div>
			</div>}
		</PopoverContent>
	</Popover>;
}
