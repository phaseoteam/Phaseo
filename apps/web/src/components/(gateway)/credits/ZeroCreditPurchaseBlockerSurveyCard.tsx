"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { captureProductEvent } from "@/lib/productAnalytics";

const REASON_OPTIONS = [
	{ key: "setup_unclear", label: "Setup is unclear" },
	{ key: "pricing_unclear", label: "Pricing is unclear" },
	{ key: "model_choice_unclear", label: "I don't know which model to pick" },
	{ key: "payment_issue", label: "I hit a payment issue" },
	{ key: "just_exploring", label: "I'm just exploring" },
	{ key: "not_ready_yet", label: "I'm not ready yet" },
	{ key: "other", label: "Other" },
] as const;

const LOCAL_STORAGE_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

function getStorageKey(workspaceId: string | null | undefined): string {
	return `credits_purchase_blocker_feedback:${workspaceId ?? "unknown"}`;
}

export default function ZeroCreditPurchaseBlockerSurveyCard(props: {
	workspaceId?: string | null;
}) {
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
			toast.success("Thanks for the feedback");
		} finally {
			setIsSubmitting(false);
		}
	}

	if (submitted) {
		return (
			<Card>
				<CardHeader className="pb-3">
					<div className="flex items-center gap-2">
						<Badge variant="secondary">Feedback received</Badge>
						<CardTitle className="text-base">
							Thanks for telling us where the friction is.
						</CardTitle>
					</div>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">
						We'll use this to improve setup, pricing clarity, model guidance,
						and checkout.
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
					<Badge variant="secondary">15-second survey</Badge>
					<CardTitle className="text-base">
						What's stopping you from purchasing credits?
					</CardTitle>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				<p className="text-sm text-muted-foreground">
					If something is blocking your first top-up, tell us which part is
					frictional. This only shows for zero-balance workspaces that have not
					completed a credit purchase yet.
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
								{option.label}
							</button>
						);
					})}
				</div>

				<div className="space-y-2">
					<div className="text-sm font-medium">Optional detail</div>
					<Textarea
						value={details}
						onChange={(event) => setDetails(event.target.value)}
						placeholder="Anything specific that made you stop?"
						maxLength={2000}
					/>
				</div>

				<div className="flex items-center justify-between gap-3">
					<p className="text-xs text-muted-foreground">
						Answers are tied to this workspace so we can fix the right part of
						the flow.
					</p>
					<Button
						onClick={handleSubmit}
						disabled={!reasonKey || isSubmitting}
					>
						{isSubmitting ? "Sending..." : "Send feedback"}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
