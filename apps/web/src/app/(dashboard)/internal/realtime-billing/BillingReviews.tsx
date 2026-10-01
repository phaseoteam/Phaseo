"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { decideReview, loadReviewDetails } from "./actions";
import type { Decision, Review, ReviewDetails } from "./types";

const usd = (nanos: number | null) => nanos == null ? "Unavailable" : `$${(Number(nanos) / 1e9).toFixed(6)}`;
const labels: Record<Decision, string> = { retry: "Recheck evidence", retain: "Retain for 24 hours", capture_confirmed: "Capture confirmed usage",
	write_off: "Release hold / write off", restore_access: "Restore realtime access" };

export function BillingReviews({ reviews }: { reviews: Review[] }) {
	const router = useRouter();
	const [selected, setSelected] = useState<Review | null>(null);
	const [details, setDetails] = useState<ReviewDetails | null>(null);
	const [action, setAction] = useState<Decision | null>(null);
	const [reason, setReason] = useState("");
	const [operationId, setOperationId] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();
	function open(review: Review) {
		setSelected(review); setDetails(null); setError(null);
		startTransition(async () => {
			try { setDetails(await loadReviewDetails(review.session_id)); }
			catch { setError("Unable to load evidence. Close this review and try again."); }
		});
	}
	function choose(next: Decision) { setAction(next); setReason(""); setOperationId(crypto.randomUUID()); setError(null); }
	function confirm() {
		if (!selected || !action) return;
		startTransition(async () => {
			const result = await decideReview(selected.session_id, selected.version, operationId, action, reason);
			if (result.error) { setError(result.error); return; }
			setAction(null); setSelected(null); router.refresh();
		});
	}
	return <>
		<ScrollArea className="max-h-[65vh] rounded-lg border" scrollBarOrientation="both" viewportClassName="max-h-[65vh]">
			<Table><TableHeader><TableRow><TableHead>Session</TableHead><TableHead>Held</TableHead><TableHead>Confirmed</TableHead><TableHead>Review due</TableHead><TableHead>Access</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
				<TableBody>{reviews.map((review) => <TableRow key={review.session_id}>
					<TableCell><div className="font-medium">{review.session.model_id}</div><div className="font-mono text-xs text-muted-foreground">{review.session_id}</div></TableCell>
					<TableCell>{usd(review.status === "open" ? review.session.reserved_nanos : 0)}</TableCell>
					<TableCell>{usd(review.confirmed_cost_nanos)}<div className="text-xs text-muted-foreground">{review.evidence_complete ? "Final evidence" : "Partial evidence"}</div></TableCell>
					<TableCell>{new Date(review.review_due_at).toLocaleString()}</TableCell>
					<TableCell><Badge variant="outline">{review.access_blocked ? "Blocked" : "Restored"}</Badge></TableCell>
					<TableCell><Button variant="outline" size="sm" onClick={() => open(review)}>Review</Button></TableCell>
				</TableRow>)}{reviews.length === 0 && <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No reviews in this queue.</TableCell></TableRow>}</TableBody>
			</Table>
		</ScrollArea>
		<Dialog open={selected !== null} onOpenChange={(value) => { if (!value && !pending) setSelected(null); }}>
			<DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
				<DialogHeader><DialogTitle>Session billing</DialogTitle><DialogDescription className="break-all">{selected?.session_id}</DialogDescription></DialogHeader>
				<ScrollArea className="min-h-0 flex-1" viewportClassName="max-h-[60vh]" >
					{selected && <div className="space-y-5 pr-4 text-sm">
						<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2"><dt>Workspace</dt><dd className="break-all font-mono text-xs">{selected.workspace_id}</dd>
							<dt>User</dt><dd className="break-all">{selected.session.user_id ?? "Unknown"}</dd>
							<dt>Provider session</dt><dd className="break-all">{selected.session.provider_session_id ?? "Not recorded"}</dd>
							<dt>Reason</dt><dd className="break-all">{selected.session.disconnect_reason ?? "Missing final usage"}</dd>
							<dt>Confirmed cost</dt><dd>{usd(selected.confirmed_cost_nanos)}</dd><dt>Captured</dt><dd>{usd(selected.session.captured_nanos)}</dd>
							<dt>Released</dt><dd>{usd(selected.session.released_nanos)}</dd><dt>Evidence checks</dt><dd>{selected.attempts}</dd></dl>
						{selected.recovery_error && <p className="text-destructive">{selected.recovery_error}</p>}
						{details ? <section className="space-y-3"><h3 className="font-medium">Provider evidence</h3>
							<p>{details.evidence.live_seconds ?? "Unknown"} voice seconds · {details.evidence.live_final ? "Final duration" : "Final duration missing"}</p>
							<p>{details.evidence.live_responses.length} completed backend responses · {details.evidence.live_pending_responses.length} pending · {details.evidence.live_tool_calls.filter((tool) => tool.done).length} completed search calls</p>
							{details.evidence.live_responses.map((response) => <div key={response.id} className="rounded-md border p-3">
								<p className="break-all font-mono text-xs">{response.id}</p><p>{response.model} · {response.service_tier ?? "default"}</p>
								<p>{response.usage.input_tokens ?? 0} input · {response.usage.cached_read_text_tokens ?? 0} cached · {response.usage.output_tokens ?? 0} output tokens</p>
							</div>)}
							<h3 className="font-medium">Decision history</h3>
							{details.decisions.length === 0 && <p className="text-muted-foreground">No decisions yet.</p>}
							{details.decisions.map((decision) => <div key={decision.operation_id} className="border-l-2 pl-3"><p>{decision.action} · {decision.actor_user_id ?? "System"}</p><p>{decision.reason}</p><p className="text-xs text-muted-foreground">{new Date(decision.created_at).toLocaleString()}</p></div>)}
						</section> : <p role="status">{pending ? "Loading evidence…" : "Evidence unavailable."}</p>}
						<p className="text-muted-foreground">Partial capture writes off the unknown remainder. Releasing a hold does not restore realtime access. Dashboard totals alone cannot prove this session’s bill.</p>
						<div className="flex flex-wrap gap-2">{(selected.status === "open" ? ["retry", "retain", "capture_confirmed", "write_off"] : selected.access_blocked ? ["restore_access"] : []).map((value) => {
							const decision = value as Decision;
							return <Button key={decision} variant="outline" size="sm" disabled={pending || !details || (decision === "capture_confirmed" && selected.confirmed_cost_nanos == null)} onClick={() => choose(decision)}>{labels[decision]}</Button>;
						})}</div>
					</div>}
				</ScrollArea>
				{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
			</DialogContent>
		</Dialog>
		<AlertDialog open={action !== null} onOpenChange={(value) => { if (!value && !pending) setAction(null); }}>
			<AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{action ? labels[action] : "Confirm decision"}?</AlertDialogTitle>
				<AlertDialogDescription>{action === "capture_confirmed" ? `Capture ${usd(selected?.confirmed_cost_nanos ?? null)}, release the excess hold, and write off any unproven remainder. This decision is final.` : action === "write_off" ? "Release the entire hold without charging. Any unproven usage is written off. Realtime access stays blocked." : action === "restore_access" ? "Allow this workspace to create realtime sessions again, unless another review still blocks it." : action === "retry" ? "Queue a server evidence check. This does not start a model call or change the hold." : "Keep the hold for another 24 hours, up to seven days from opening. Overdue reviews remain visible; they are never silently charged."}</AlertDialogDescription></AlertDialogHeader>
				<label htmlFor="billing-decision-reason" className="text-sm font-medium">Reason</label><Textarea id="billing-decision-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} placeholder="Record the evidence and your decision (at least 10 characters)." />
				{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
				<AlertDialogFooter><AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel><Button disabled={pending || reason.trim().length < 10} onClick={confirm}>{pending ? "Saving…" : "Confirm"}</Button></AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	</>;
}
