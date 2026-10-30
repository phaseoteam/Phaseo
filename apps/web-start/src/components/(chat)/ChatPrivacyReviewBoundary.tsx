"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { getBrowserAccessToken } from "@/lib/fetchers/internal/accountAuthClient";
import { fetchAccountWebApi } from "@/lib/web-api/client";

type Review = { version: string; reviewed: boolean; workspaceId: string; workspaceName: string; policy: Record<string, unknown> };

export function ChatPrivacyReviewBoundary({ children, workspaceId, signedIn }: {
	children: ReactNode; workspaceId?: string; signedIn: boolean;
}) {
	const t = useTranslations("Product.privacyReview");
	const [review, setReview] = useState<Review | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	useEffect(() => {
		let active = true;
		if (!signedIn) return;
		void getBrowserAccessToken().then(token => fetchAccountWebApi<Review>(
			"/api/account/settings/privacy/review", token,
		)).then(value => { if (active) setReview(value); })
			.catch(() => { if (active) setError(t("loadError")); });
		return () => { active = false; };
	}, [workspaceId, signedIn, t]);
	if (!signedIn) return children;
	if (review?.reviewed) return children;
	async function accept() {
		if (!review) return;
		setSaving(true);
		setError(null);
		try {
			await fetchAccountWebApi("/api/account/settings/privacy/review", await getBrowserAccessToken(), {
				method: "POST", body: JSON.stringify({ workspaceId: review.workspaceId, version: review.version, accepted: true }),
			});
			setReview({ ...review, reviewed: true });
		} catch { setError(t("saveError")); }
		finally { setSaving(false); }
	}
	return <section className="mx-auto max-w-xl space-y-5 p-6" aria-labelledby="chat-privacy-review-title">
		<h1 id="chat-privacy-review-title" className="text-xl font-semibold">{t("title")}</h1>
		<p className="text-sm text-muted-foreground">{t("description")}</p>
		{review ? <>
			<h2 className="font-medium">{review.workspaceName}</h2>
			<dl className="grid grid-cols-2 gap-3 text-sm">
				<dt>{t("paidTraining")}</dt><dd>{t(review.policy.privacy_enable_paid_may_train !== false ? "allowed" : "blocked")}</dd>
				<dt>{t("freeTraining")}</dt><dd>{t(review.policy.privacy_enable_free_may_train !== false ? "allowed" : "blocked")}</dd>
				<dt>{t("publication")}</dt><dd>{t(review.policy.privacy_enable_free_may_publish_prompts !== false ? "allowed" : "blocked")}</dd>
				<dt>{t("providerLogging")}</dt><dd>{t(review.policy.privacy_enable_input_output_logging !== false ? "allowed" : "blocked")}</dd>
				<dt>{t("zdr")}</dt><dd>{t(review.policy.privacy_zdr_only === true ? "required" : "notRequired")}</dd>
				<dt>{t("workspaceLogging")}</dt><dd>{review.policy.io_logging_enabled === true ? t("enabledDays", { days: Number(review.policy.io_logging_retention_days ?? 90) }) : t("disabled")}</dd>
				<dt>{t("providers")}</dt><dd>{String(review.policy.provider_restriction_mode ?? t("none"))}: {Array.isArray(review.policy.provider_restriction_provider_ids) && review.policy.provider_restriction_provider_ids.length ? review.policy.provider_restriction_provider_ids.join(", ") : t("none")}</dd>
				<dt>{t("models")}</dt><dd>{String(review.policy.model_restriction_mode ?? t("none"))}: {Array.isArray(review.policy.model_restriction_model_ids) && review.policy.model_restriction_model_ids.length ? review.policy.model_restriction_model_ids.join(", ") : t("none")}</dd>
			</dl>
			<p className="text-sm text-muted-foreground">{t("administrators")}</p>
			<div className="flex flex-wrap gap-3"><Button disabled={saving} onClick={() => void accept()}>{t(saving ? "saving" : "accept")}</Button><Button variant="outline" asChild><Link href="/settings/privacy">{t("settings")}</Link></Button></div>
		</> : !error ? <p role="status">{t("loading")}</p> : null}
		{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
	</section>;
}
