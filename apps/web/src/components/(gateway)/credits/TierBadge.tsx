"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";

const HIDE_ENTERPRISE_REFERENCES = true;

type TierBadgeProps = {
	href: string;
	tierName: string;
	feePct: number;
	savingsPoints: number;
	savingsAmountFormatted?: string | null;
	nextTierName?: string | null;
	nextFeePct?: number | null;
	nextDiscountDelta?: number | null;
	remainingFormatted?: string | null;
	topTier?: boolean;
};

export function TierBadge({
	href,
	tierName,
	feePct,
	savingsPoints,
	savingsAmountFormatted,
	nextTierName,
	nextFeePct,
	nextDiscountDelta,
	remainingFormatted,
	topTier = false,
}: TierBadgeProps) {
	const t = useTranslations("SettingsUI.credits");
	const hasSavings = savingsPoints > 0;
	const displayTierName = HIDE_ENTERPRISE_REFERENCES ? t("standard") : tierName;
	const showNextTierHint =
		!HIDE_ENTERPRISE_REFERENCES && nextTierName && remainingFormatted;
	return (
		<HoverCard>
			<HoverCardTrigger asChild>
				<Link
					href={href}
					className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-800 transition hover:border-indigo-300 hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 dark:border-indigo-900/60 dark:bg-indigo-900/40 dark:text-indigo-200 dark:hover:border-indigo-700 dark:hover:bg-indigo-900/60"
				>
					<span>{t("tierLabel", { tier: displayTierName })}</span>
					<Badge
						variant="secondary"
						className="flex items-center gap-1 rounded-full bg-white/70 px-2 py-0 text-[11px] text-indigo-800 shadow-sm dark:bg-zinc-900/70 dark:text-indigo-200"
					>
						{feePct.toFixed(1)}%
						<ArrowUpRight className="h-3 w-3" aria-hidden />
					</Badge>
				</Link>
			</HoverCardTrigger>

			<HoverCardContent className="w-72 text-sm">
				<div className="space-y-2">
					<div>
						<div className="font-medium text-foreground">
							{t("currentTierLower")}: {displayTierName}
						</div>
						<div className="text-xs text-muted-foreground">
							{t("topUpFee")}: {feePct.toFixed(1)}%{" "}
							{hasSavings
								? `(${t("saveVsBasic", { percent: savingsPoints.toFixed(1) })})`
								: ""}
						</div>
					</div>

					{hasSavings && savingsAmountFormatted && (
						<p className="text-xs text-muted-foreground">
							{t("approxSavingsThisMonth", { amount: savingsAmountFormatted })}
						</p>
					)}

					{topTier ? (
						!HIDE_ENTERPRISE_REFERENCES ? (
							<p className="text-xs text-muted-foreground">
								{t("enterpriseTierDisclosure")}
							</p>
						) : null
					) : (
						<>
							{showNextTierHint && (
								<p className="text-xs text-muted-foreground">
									{t("spendToUnlockTier", {
										amount: remainingFormatted,
										tier: nextTierName,
									})}
									{nextFeePct !== undefined && nextFeePct !== null ? (
										<>
											{" "}
											(
											{t("topUpFeePercent", {
												percent: nextFeePct.toFixed(1),
											})}
											{nextDiscountDelta
												? `, ${t("saveVsBasic", { percent: nextDiscountDelta.toFixed(1) })}`
												: ""}
											)
										</>
									) : null}
									.
								</p>
							)}
						</>
					)}

					<p className="text-xs text-muted-foreground">
						{t("clickPricingDetails")}
					</p>
				</div>
			</HoverCardContent>
		</HoverCard>
	);
}
