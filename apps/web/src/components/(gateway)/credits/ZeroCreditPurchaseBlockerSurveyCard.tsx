"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { captureProductEvent } from "@/lib/productAnalytics";
import { useTranslations } from "next-intl";

const REASON_OPTIONS = [
	{ key: "setup_unclear", labelKey: "surveySetup" },
	{ key: "pricing_unclear", labelKey: "surveyPricing" },
	{ key: "model_choice_unclear", labelKey: "surveyModel" },
	{ key: "payment_issue", labelKey: "surveyPayment" },
	{ key: "just_exploring", labelKey: "surveyExploring" },
	{ key: "not_ready_yet", labelKey: "surveyNotReady" },
	{ key: "other", labelKey: "other" },
] as const;

const LOCAL_STORAGE_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

function getStorageKey(workspaceId: string | null | undefined): string {
	return `credits_purchase_blocker_feedback:${workspaceId ?? "unknown"}`;
}

export default function ZeroCreditPurchaseBlockerSurveyCard(props: {
	workspaceId?: string | null;
}) {
	const t = useTranslations("SettingsUI.credits");
	const [reasonKey, setReasonKey] = React.useState<
		(typeof REASON_OPTIONS)[number]["key"] | null
	>(null);
	const [details, setDetails] = React.useState("");
	const [isSubmitting, setIsSubmitting] = React.useState(false);
	const [submitted, setSubmitted] = React.useState(false);
	const [cooldownChecked, setCooldownChecked] = React.useState(false);

	React.useEffect(() => {
		if (typeof window === "undefined") return;
		try {
			const rawValue = window.localStorage.getItem(
				getStorageKey(props.workspaceId),
			);
			if (!rawValue) return;
			const submittedAtMs = Number(rawValue);
			if (!Number.isFinite(submittedAtMs)) {
				window.localStorage.removeItem(getStorageKey(props.workspaceId));
				return;
			}
			const ageMs = Date.now() - submittedAtMs;
			if (ageMs >= 0 && ageMs < LOCAL_STORAGE_COOLDOWN_MS) {
				setSubmitted(true);
			} else {
				window.localStorage.removeItem(getStorageKey(props.workspaceId));
			}
		} catch {
			// no-op; local survey cooldown should never break the page
		} finally {
			setCooldownChecked(true);
		}
	}, [props.workspaceId]);

	React.useEffect(() => {
		if (!cooldownChecked || submitted) return;
		captureProductEvent("credits_purchase_blocker_survey_viewed", {
			surface: "settings_credits_zero_balance",
		});
	}, [cooldownChecked, props.workspaceId, submitted]);

	async function handleSubmit() {
		if (!reasonKey || isSubmitting) return;

		setIsSubmitting(true);
		try {
			captureProductEvent("credits_purchase_blocker_feedback_submitted", {
				has_details: details.trim().length > 0,
				reason_key: reasonKey,
				surface: "settings_credits_zero_balance",
			});

			if (typeof window !== "undefined") {
				window.localStorage.setItem(
					getStorageKey(props.workspaceId),
					String(Date.now()),
				);
			}

			setSubmitted(true);
			toast.success(t("thanksFeedback"));
		} finally {
			setIsSubmitting(false);
		}
	}

	if (submitted) {
		return (
			<Card>
				<CardHeader className="pb-3">
					<div className="flex items-center gap-2">
						<Badge variant="secondary">{t("feedbackReceived")}</Badge>
						<CardTitle className="text-base">
							{t("surveyThanks")}
						</CardTitle>
					</div>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">
						{t("surveyThanksBody")}
					</p>
				</CardContent>
			</Card>
		);
	}

	if (!cooldownChecked) return null;

	return (
		<Card>
			<CardHeader className="pb-3">
				<div className="flex flex-wrap items-center gap-2">
					<Badge variant="secondary">{t("surveyBadge")}</Badge>
					<CardTitle className="text-base">
						{t("surveyTitle")}
					</CardTitle>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				<p className="text-sm text-muted-foreground">
					{t("surveyDescription")}
				</p>

				<div className="flex flex-wrap gap-2">
					{REASON_OPTIONS.map((option) => {
						const selected = reasonKey === option.key;
						return (
							<button
								key={option.key}
								type="button"
								aria-pressed={selected}
								className={cn(
									"rounded-full border px-3 py-2 text-sm transition-colors",
									selected
										? "border-zinc-900 bg-zinc-900 text-white"
										: "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:text-zinc-950",
								)}
								onClick={() => setReasonKey(option.key)}
							>
								{t(option.labelKey)}
							</button>
						);
					})}
				</div>

				<div className="space-y-2">
					<div className="text-sm font-medium">{t("optionalDetail")}</div>
					<Textarea
						value={details}
						onChange={(event) => setDetails(event.target.value)}
						placeholder={t("surveyPlaceholder")}
						maxLength={2000}
					/>
				</div>

				<div className="flex items-center justify-between gap-3">
					<p className="text-xs text-muted-foreground">
						{t("surveyPrivacy")}
					</p>
					<Button
						onClick={handleSubmit}
						disabled={!reasonKey || isSubmitting}
					>
						{isSubmitting ? t("sending") : t("sendFeedback")}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
