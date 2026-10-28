"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import type { SettingsRateLimitTier } from "@/lib/fetchers/internal/settingsTypes";
import { raiseRateLimitTier } from "@/app/(dashboard)/settings/rate-limits/actions";
import { useSettingsWrite } from "../PrivateSettingsQuery";

/**
 * The workspace's trust-ladder tier, and the owner's one-step raise. Hidden
 * while self-serve raises are switched off; the gateway decides eligibility
 * and refuses anyone but the owner.
 */
export default function WorkspaceTierSection({ tier }: { tier: SettingsRateLimitTier | null }) {
	const t = useTranslations("SettingsUI.rateLimitPolicies.tier");
	const format = useDisplayFormatters();
	const write = useSettingsWrite();
	const [confirming, setConfirming] = useState(false);
	const [raising, startRaising] = useTransition();
	if (!tier || tier.refusal === "disabled") return null;
	const date = (value: number) => format.dateParts(new Date(value).toISOString(), { month: "short", day: "numeric", year: "numeric" });
	const target = tier.target ? t(`tiers.${tier.target}`) : null;
	const minPaid = format.number(tier.thresholds.minLifetimePaidSpendUsd, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

	const status = (() => {
		if (tier.activeUntil !== null && tier.target) return t("raisedUntil", { tier: target ?? "", date: date(tier.activeUntil) });
		switch (tier.refusal) {
			case "override": return t("refusals.override");
			case "top_tier": return t("refusals.top_tier");
			case "no_paid_top_up": return t("refusals.no_paid_top_up");
			case "too_new": return t("refusals.too_new", { days: tier.thresholds.minAgeDays });
			case "not_enough_spend": return t("refusals.not_enough_spend", { amount: minPaid });
			case "cooldown": return tier.availableAt !== null ? t("refusals.cooldown", { date: date(tier.availableAt) }) : null;
			default: return null;
		}
	})();

	function raise() {
		startRaising(async () => {
			const result = await write(raiseRateLimitTier());
			if (!result.ok) {
				toast.error(t("raiseFailed"));
				return;
			}
			setConfirming(false);
			toast.success(t("raised"));
		});
	}

	return (
		<section className="space-y-3">
			<div>
				<h2 className="text-base font-semibold">{t("title")}</h2>
				<p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
			</div>
			<div className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3">
				<div className="space-y-1">
					<p className="text-sm font-medium">{t("current", { tier: t(`tiers.${tier.tier}`), count: tier.requestsPerMinute })}</p>
					{status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
					{tier.eligible && !tier.canRaise ? <p className="text-sm text-muted-foreground">{t("ownerOnly")}</p> : null}
				</div>
				{tier.canRaise && target ? (
					<Button type="button" variant="outline" className="rounded-md" onClick={() => setConfirming(true)}>
						{t("raise", { tier: target })}
					</Button>
				) : null}
			</div>
			<AlertDialog open={confirming} onOpenChange={(open) => { if (!raising) setConfirming(open); }}>
				<AlertDialogContent className="rounded-md">
					<AlertDialogHeader>
						<AlertDialogTitle>{t("confirmTitle", { tier: target ?? "", days: tier.durationDays })}</AlertDialogTitle>
						<AlertDialogDescription>
							{t("confirmBody", { count: tier.targetRequestsPerMinute ?? 0, days: tier.durationDays })}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel className="rounded-md" disabled={raising}>{t("cancel")}</AlertDialogCancel>
						<AlertDialogAction className="rounded-md" disabled={raising} onClick={(event) => { event.preventDefault(); raise(); }}>
							{raising ? t("raising") : t("confirm")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</section>
	);
}
