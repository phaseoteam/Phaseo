import { useState } from "react";
import { MessageSquare, X } from "lucide-react";
import type { PullRequestAction, PullRequestView } from "../../../shared/pullRequestView";
import { Select } from "../../components/Select";
import { Button } from "../../components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { Textarea } from "../../components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import { segmentedGroup, segmentedItem } from "./segmented";

type Verdict = Extract<PullRequestAction, { type: "review" }>["event"];
const verdicts: { value: Verdict; label: string }[] = [{ value: "comment", label: "Comment" }, { value: "approve", label: "Approve" }, { value: "request-changes", label: "Request changes" }];

/** T3's floating composer: a comment on the conversation, or a review with a verdict. Drafts survive closing it. */
export function Composer({ view, pending, error, onAction }: { view: PullRequestView; pending: PullRequestAction["type"] | undefined; error?: string; onAction: (action: PullRequestAction) => Promise<boolean> }) {
	const [open, setOpen] = useState(false), [mode, setMode] = useState<"comment" | "review">("comment");
	const [comment, setComment] = useState(""), [summary, setSummary] = useState(""), [verdict, setVerdict] = useState<Verdict>("comment");
	// GitHub does not let authors approve or request changes on their own pull request.
	const own = !!view.viewer.login && view.viewer.login.toLowerCase() === view.author.toLowerCase();
	const options = own ? verdicts.filter(value => value.value === "comment") : verdicts;
	const submitComment = async () => { if (await onAction({ type: "comment", body: comment })) { setComment(""); setOpen(false); } };
	const submitReview = async () => { if (await onAction({ type: "review", event: verdict, body: summary })) { setSummary(""); setVerdict("comment"); setOpen(false); } };
	const needsSummary = verdict !== "approve" && !summary.trim();
	return <Popover open={open} onOpenChange={setOpen}>
		<PopoverTrigger render={<Button size="icon" variant="outline" className="rounded-full bg-background shadow-md" aria-label={mode === "review" ? "Review pull request" : "Comment on pull request"} />}><MessageSquare className="size-4" /></PopoverTrigger>
		<PopoverContent side="top" align="end" sideOffset={8} className="w-96 gap-3 p-3" aria-label="Pull request composer">
			<div className="flex items-center justify-between gap-2">
				<ToggleGroup aria-label="Composer mode" value={mode} onValueChange={(value: string) => { if (value === "comment" || value === "review") setMode(value); }} spacing={0.5} className={segmentedGroup}>
					<ToggleGroupItem value="comment" className={segmentedItem}>Comment</ToggleGroupItem>
					<ToggleGroupItem value="review" className={segmentedItem}>Review</ToggleGroupItem>
				</ToggleGroup>
				<Button size="icon-xs" variant="ghost" aria-label="Close composer" onClick={() => setOpen(false)}><X className="size-3.5" /></Button>
			</div>
			{mode === "comment" ? <>
				<Textarea autoFocus value={comment} disabled={!!pending} onChange={event => setComment(event.target.value)} placeholder="Leave a comment" aria-label="Comment" className="min-h-24 text-xs" onKeyDown={event => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && comment.trim()) { event.preventDefault(); void submitComment(); } }} />
				<div className="flex justify-end"><Button size="xs" disabled={!!pending || !comment.trim()} onClick={() => void submitComment()}>{pending === "comment" ? "Posting…" : "Comment"}</Button></div>
			</> : <>
				<Textarea autoFocus value={summary} disabled={!!pending} onChange={event => setSummary(event.target.value)} placeholder={verdict === "approve" ? "Add a summary (optional)" : "Summarise your review"} aria-label="Review summary" className="min-h-24 text-xs" />
				<div className="flex items-center justify-between gap-2"><Select label="Review verdict" value={verdict} onValueChange={value => setVerdict(value as Verdict)} options={options} /><Button size="xs" disabled={!!pending || needsSummary} onClick={() => void submitReview()}>{pending === "review" ? "Submitting…" : "Submit review"}</Button></div>
			</>}
			{error && <p role="alert" className="text-xs text-destructive">{error}</p>}
		</PopoverContent>
	</Popover>;
}
