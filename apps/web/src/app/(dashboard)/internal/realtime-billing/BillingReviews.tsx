"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { decideReview, loadReviewDetails } from "./actions";
import type { Decision, Review, ReviewDetails } from "./types";


export function BillingReviews({ reviews }: { reviews: Review[] }) {
	const t = useTranslations("SettingsUI");
	const tStatus = useTranslations("SettingsUI.labels");
	const locale = useLocale();
	const usd = (nanos: number | null) => nanos == null ? t("realtimeCopy.copyUnavailable") : new Intl.NumberFormat(locale, { style: "currency", currency: "USD", minimumFractionDigits: 6, maximumFractionDigits: 6 }).format(Number(nanos) / 1e9);
	const labels: Record<Decision, string> = { retry: t("realtimeCopy.retry"), retain: t("realtimeCopy.retain"), capture_confirmed: t("realtimeCopy.capture_confirmed"),
		write_off: t("realtimeCopy.write_off"), restore_access: t("realtimeCopy.restore_access") };
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
			catch { setError(t("realtimeCopy.evidenceLoadFailed")); }
		});
	}
	function choose(next: Decision) { setAction(next); setReason(""); setOperationId(crypto.randomUUID()); setError(null); }
	function confirm() {
		if (!selected || !action) return;
		startTransition(async () => {
			try {
				const result = await decideReview(selected.session_id, selected.version, operationId, action, reason);
				if (result.error) { setError(t("realtimeCopy.decisionSaveFailed")); return; }
				setAction(null); setSelected(null); router.refresh();
			} catch { setError(t("realtimeCopy.decisionSaveFailed")); }
		});
	}
	return <>
		<ScrollArea className="max-h-[65vh] rounded-lg border" scrollBarOrientation="both" viewportClassName="max-h-[65vh]">
			<Table><TableHeader><TableRow><TableHead>{t("realtimeCopy.copySession")}</TableHead><TableHead>{t("realtimeCopy.held")}</TableHead><TableHead>{t("realtimeCopy.confirmed")}</TableHead><TableHead>{t("realtimeCopy.reviewDue")}</TableHead><TableHead>{t("realtimeCopy.copyAccess")}</TableHead><TableHead><span className="sr-only">{t("realtimeCopy.copyActions")}</span></TableHead></TableRow></TableHeader>
				<TableBody>{reviews.map((review) => <TableRow key={review.session_id}>
					<TableCell><div className="font-medium">{review.session.model_id}</div><div className="font-mono text-xs text-muted-foreground">{review.session_id}</div></TableCell>
					<TableCell>{usd(review.status === "open" ? review.session.reserved_nanos : 0)}</TableCell>
					<TableCell>{usd(review.confirmed_cost_nanos)}<div className="text-xs text-muted-foreground">{review.evidence_complete ? t("realtimeCopy.finalEvidence") : t("realtimeCopy.partialEvidence")}</div></TableCell>
					<TableCell>{new Date(review.review_due_at).toLocaleString(locale)}</TableCell>
					<TableCell><Badge variant="outline">{review.access_blocked ? t("realtimeCopy.copyBlocked") : t("realtimeCopy.restored")}</Badge></TableCell>
					<TableCell><Button variant="outline" size="sm" onClick={() => open(review)}>{t("realtimeCopy.copyReview")}</Button></TableCell>
				</TableRow>)}{reviews.length === 0 && <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">{t("realtimeCopy.noReviews")}</TableCell></TableRow>}</TableBody>
			</Table>
		</ScrollArea>
		<Dialog open={selected !== null} onOpenChange={(value) => { if (!value && !pending) setSelected(null); }}>
			<DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
				<DialogHeader><DialogTitle>{t("realtimeCopy.sessionBilling")}</DialogTitle><DialogDescription className="break-all">{selected?.session_id}</DialogDescription></DialogHeader>
				<ScrollArea className="min-h-0 flex-1" viewportClassName="max-h-[60vh]" >
					{selected && <div className="space-y-5 pr-4 text-sm">
						<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2"><dt>{t("realtimeCopy.copyWorkspace")}</dt><dd className="break-all font-mono text-xs">{selected.workspace_id}</dd>
							<dt>{t("realtimeCopy.copyUser")}</dt><dd className="break-all">{selected.session.user_id ?? t("realtimeCopy.copyUnknown")}</dd>
							<dt>{t("realtimeCopy.providerSession")}</dt><dd className="break-all">{selected.session.provider_session_id ?? t("realtimeCopy.copyNotRecorded")}</dd>
							<dt>{t("realtimeCopy.copyReason")}</dt><dd className="break-all">{selected.session.disconnect_reason ?? t("realtimeCopy.missingFinalUsage")}</dd>
							<dt>{t("realtimeCopy.confirmedCost")}</dt><dd>{usd(selected.confirmed_cost_nanos)}</dd><dt>{t("realtimeCopy.captured")}</dt><dd>{usd(selected.session.captured_nanos)}</dd>
							<dt>{t("realtimeCopy.copyReleased")}</dt><dd>{usd(selected.session.released_nanos)}</dd><dt>{t("realtimeCopy.evidenceChecks")}</dt><dd>{new Intl.NumberFormat(locale).format(selected.attempts)}</dd></dl>
						{selected.recovery_error && <p className="text-destructive">{selected.recovery_error}</p>}
						{details ? <section className="space-y-3"><h3 className="font-medium">{t("realtimeCopy.providerEvidence")}</h3>
							<p>{t("realtimeCopy.voiceSeconds", { seconds: details.evidence.live_seconds == null ? t("realtimeCopy.copyUnknown") : new Intl.NumberFormat(locale).format(details.evidence.live_seconds), duration: details.evidence.live_final ? t("realtimeCopy.finalDuration") : t("realtimeCopy.finalDurationMissing") })}</p>
							<p>{t("realtimeCopy.backendCounts", { completed: new Intl.NumberFormat(locale).format(details.evidence.live_responses.length), pending: new Intl.NumberFormat(locale).format(details.evidence.live_pending_responses.length), searches: new Intl.NumberFormat(locale).format(details.evidence.live_tool_calls.filter((tool) => tool.done).length) })}</p>
							{details.evidence.live_responses.map((response) => <div key={response.id} className="rounded-md border p-3">
								<p className="break-all font-mono text-xs">{response.id}</p><p>{response.model} · {response.service_tier ?? tStatus("default")}</p>
								<p>{t("realtimeCopy.tokenCounts", { input: new Intl.NumberFormat(locale).format(response.usage.input_tokens ?? 0), cached: new Intl.NumberFormat(locale).format(response.usage.cached_read_text_tokens ?? 0), output: new Intl.NumberFormat(locale).format(response.usage.output_tokens ?? 0) })}</p>
							</div>)}
							<h3 className="font-medium">{t("realtimeCopy.decisionHistory")}</h3>
							{details.decisions.length === 0 && <p className="text-muted-foreground">{t("realtimeCopy.noDecisions")}</p>}
							{details.decisions.map((decision) => <div key={decision.operation_id} className="border-l-2 pl-3"><p>{labels[decision.action as Decision] ?? decision.action} · {decision.actor_user_id ?? t("realtimeCopy.copySystem")}</p><p>{decision.reason}</p><p className="text-xs text-muted-foreground">{new Date(decision.created_at).toLocaleString(locale)}</p></div>)}
						</section> : <p role="status">{pending ? t("realtimeCopy.loadingEvidence") : t("realtimeCopy.evidenceUnavailable")}</p>}
						<p className="text-muted-foreground">{t("realtimeCopy.partialWarning")}</p>
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
			<AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("realtimeCopy.confirmTitle", { decision: action ? labels[action] : t("realtimeCopy.confirmDecision") })}</AlertDialogTitle>
				<AlertDialogDescription>{action === "capture_confirmed" ? t("realtimeCopy.captureWarning", { amount: usd(selected?.confirmed_cost_nanos ?? null) }) : action === "write_off" ? t("realtimeCopy.writeOffWarning") : action === "restore_access" ? t("realtimeCopy.restoreWarning") : action === "retry" ? t("realtimeCopy.retryWarning") : t("realtimeCopy.retainWarning")}</AlertDialogDescription></AlertDialogHeader>
				<label htmlFor="billing-decision-reason" className="text-sm font-medium">{t("realtimeCopy.copyReason")}</label><Textarea id="billing-decision-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} placeholder={t("realtimeCopy.reasonPlaceholder")} />
				{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
				<AlertDialogFooter><AlertDialogCancel disabled={pending}>{t("realtimeCopy.copyCancel")}</AlertDialogCancel><Button disabled={pending || reason.trim().length < 10} onClick={confirm}>{pending ? t("realtimeCopy.copySaving") : t("realtimeCopy.confirm")}</Button></AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	</>;
}
