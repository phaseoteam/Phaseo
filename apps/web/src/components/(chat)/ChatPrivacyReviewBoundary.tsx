"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getBrowserAccessToken } from "@/lib/fetchers/internal/accountAuthClient";
import { fetchAccountWebApi } from "@/lib/web-api/client";

type Review = { version: string; reviewed: boolean; workspaceName: string; policy: Record<string, unknown> };

export function ChatPrivacyReviewBoundary({ children, workspaceId, signedIn }: {
	children: ReactNode; workspaceId?: string; signedIn: boolean;
}) {
	const [review, setReview] = useState<Review | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	useEffect(() => {
		let active = true;
		if (!signedIn || !workspaceId) return;
		void getBrowserAccessToken().then(token => fetchAccountWebApi<Review>(
			`/api/account/settings/privacy/review?workspaceId=${encodeURIComponent(workspaceId)}`, token,
		)).then(value => { if (active) setReview(value); })
			.catch(() => { if (active) setError("Unable to load privacy settings. Reload to try again."); });
		return () => { active = false; };
	}, [workspaceId, signedIn]);
	if (!signedIn || !workspaceId) return children;
	if (review?.reviewed) return children;
	async function accept() {
		if (!review || !workspaceId) return;
		setSaving(true);
		setError(null);
		try {
			await fetchAccountWebApi("/api/account/settings/privacy/review", await getBrowserAccessToken(), {
				method: "POST", body: JSON.stringify({ workspaceId, version: review.version, accepted: true }),
			});
			setReview({ ...review, reviewed: true });
		} catch { setError("Unable to save your review. Try again."); }
		finally { setSaving(false); }
	}
	return <section className="mx-auto max-w-xl space-y-5 p-6" aria-labelledby="chat-privacy-review-title">
		<h1 id="chat-privacy-review-title" className="text-xl font-semibold">Review Chat privacy</h1>
		<p className="text-sm text-muted-foreground">Account privacy preferences were removed when privacy controls moved to workspaces. Review the current settings before continuing.</p>
		{review ? <>
			<h2 className="font-medium">{review.workspaceName}</h2>
			<dl className="grid grid-cols-2 gap-3 text-sm">
				<dt>Paid providers that may train</dt><dd>{review.policy.privacy_enable_paid_may_train !== false ? "Allowed" : "Blocked"}</dd>
				<dt>Free providers that may train</dt><dd>{review.policy.privacy_enable_free_may_train !== false ? "Allowed" : "Blocked"}</dd>
				<dt>Providers that publish prompts</dt><dd>{review.policy.privacy_enable_free_may_publish_prompts !== false ? "Allowed" : "Blocked"}</dd>
				<dt>Providers that log prompts</dt><dd>{review.policy.privacy_enable_input_output_logging !== false ? "Allowed" : "Blocked"}</dd>
				<dt>Zero data retention</dt><dd>{review.policy.privacy_zdr_only === true ? "Required" : "Not required"}</dd>
				<dt>Workspace prompt logging</dt><dd>{review.policy.io_logging_enabled === true ? `Enabled (${review.policy.io_logging_retention_days ?? 90} days)` : "Disabled"}</dd>
				<dt>Provider restrictions</dt><dd>{String(review.policy.provider_restriction_mode ?? "none")}: {Array.isArray(review.policy.provider_restriction_provider_ids) ? review.policy.provider_restriction_provider_ids.join(", ") : "none"}</dd>
				<dt>Model restrictions</dt><dd>{String(review.policy.model_restriction_mode ?? "none")}: {Array.isArray(review.policy.model_restriction_model_ids) ? review.policy.model_restriction_model_ids.join(", ") : "none"}</dd>
			</dl>
			<p className="text-sm text-muted-foreground">Workspace administrators can change these settings. Additional key and member guardrails may apply.</p>
			<div className="flex flex-wrap gap-3"><Button disabled={saving} onClick={() => void accept()}>{saving ? "Saving…" : "Accept settings and continue"}</Button><Button variant="outline" asChild><Link href="/settings/privacy">Privacy settings</Link></Button></div>
		</> : !error ? <p role="status">Loading privacy settings…</p> : null}
		{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
	</section>;
}
