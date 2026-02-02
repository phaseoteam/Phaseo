"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { ArrowUpRight } from "lucide-react";

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
	const hasSavings = savingsPoints > 0;
	return (
		<HoverCard>
			<HoverCardTrigger asChild>
				<Link
					href={href}
					className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-800 transition hover:border-indigo-300 hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 dark:border-indigo-900/60 dark:bg-indigo-900/40 dark:text-indigo-200 dark:hover:border-indigo-700 dark:hover:bg-indigo-900/60"
				>
					<span>Tier: {tierName}</span>
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
							Current tier: {tierName}
						</div>
						<div className="text-xs text-muted-foreground">
							Gateway fee: {feePct.toFixed(1)}%{" "}
							{hasSavings
								? `(save ${savingsPoints.toFixed(1)}% vs Basic)`
								: ""}
						</div>
					</div>

					{hasSavings && savingsAmountFormatted && (
						<p className="text-xs text-muted-foreground">
							Approx. savings so far this month:{" "}
							<span className="font-medium text-foreground">
								{savingsAmountFormatted}
							</span>
						</p>
					)}

					{topTier ? (
						<p className="text-xs text-muted-foreground">
							You're on Enterprise tier with the lowest fee. Reach out if you
							need custom pricing or dedicated support.
						</p>
					) : (
						<>
							{nextTierName && remainingFormatted && (
								<p className="text-xs text-muted-foreground">
									Spend {remainingFormatted} more this month to
									unlock {nextTierName} tier next month
									{nextFeePct !== undefined && nextFeePct !== null ? (
										<>
											{" "}
											({nextFeePct.toFixed(1)}% fee
											{nextDiscountDelta
												? `, save ${nextDiscountDelta.toFixed(1)}%`
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
						Click to view tier details and savings.
					</p>
				</div>
			</HoverCardContent>
		</HoverCard>
	);
}
