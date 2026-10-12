"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { RefreshCredits } from "@/app/(dashboard)/settings/credits/actions";
import { toast } from "sonner";
import { CreditAmount } from "./CreditAmount";
import { useTranslations } from "next-intl";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import type { CreditRunway } from "@/lib/gateway/usage/creditRunway";

interface Props {
	balance: number;
	title?: string;
	subtitle?: string | null;
	refreshAriaLabel?: string;
	runway?: CreditRunway | null;
}

export default function CurrentCredits({
	balance,
	title,
	subtitle = null,
	refreshAriaLabel,
	runway = null,
}: Props) {
	const t = useTranslations("SettingsUI.credits");
	const format = useDisplayFormatters();
	const runwayText = (() => {
		if (!runway) return null;
		const amount = format.number(runway.dailyUsd, {
			style: "currency",
			currency: "USD",
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
			notation: "standard",
		});
		if (runway.kind === "beyond") return t("runwayBeyond", { days: runway.days, amount });
		const date = format.dateParts(runway.at, { month: "short", day: "numeric" });
		return runway.kind === "auto_top_up"
			? t("runwayAutoTopUp", { date, amount })
			: t("runwayRunsOut", { date, amount });
	})();
	title ??= t("currentBalance");
	refreshAriaLabel ??= t("refreshBalance");
	const router = useRouter();
	const [refreshing, setRefreshing] = useState(false);

	async function handleRefresh() {
		const MIN_SPIN_MS = 500; // minimum spin duration to ensure the animation is visible

		setRefreshing(true);
		const start = Date.now();
		try {
			// Call the API route which triggers server revalidation
			await toast.promise(RefreshCredits(), {
					loading: t("refreshing"),
					success: t("refreshed"),
					error: () => t("refreshFailed"),
			});
			// Pull fresh server component data for the current route.
			router.refresh();
		} catch {
			// Errors are handled by toast.promise's error handler
		} finally {
			// Ensure the spinner is visible for at least MIN_SPIN_MS
			const elapsed = Date.now() - start;
			const remaining = MIN_SPIN_MS - elapsed;
			if (remaining > 0) {
				await new Promise((res) => setTimeout(res, remaining));
			}
			setRefreshing(false);
		}
	}

	return (
		<div>
			<Card size="sm" className="gap-2">
				<CardHeader className="pb-0">
					<div className="flex items-center justify-between w-full">
						<CardTitle>{title}</CardTitle>
						<Button
							variant="ghost"
							size="icon"
							aria-label={refreshAriaLabel}
							onClick={handleRefresh}
							disabled={refreshing}
						>
							<RefreshCw
								className={`h-4 w-4 ${
									refreshing ? "animate-spin" : ""
								}`}
							/>
						</Button>
					</div>
				</CardHeader>

				<CardContent className="pt-0">
					{subtitle ? (
						<p className="text-xs text-muted-foreground mb-2">
							{subtitle}
						</p>
					) : null}
					<div>
						<CreditAmount
							value={balance}
							className={`text-3xl font-semibold ${
								balance < 0 ? "text-red-500" : ""
							}`}
						/>
					</div>
					{runwayText ? (
						<p className="mt-1.5 text-sm tabular-nums text-muted-foreground">{runwayText}</p>
					) : null}
				</CardContent>
			</Card>
		</div>
	);
}
