import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowRight, Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/server";
import {
	GATEWAY_TIERS,
	computeTierInfo,
	type GatewayTier,
} from "@/components/(gateway)/credits/tiers";

function money(amount: number, currency: string) {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency,
		maximumFractionDigits: 0,
	}).format(amount);
}

interface Props {
	teamId?: string;
	currency?: string;
}

export default async function TieringProgress({
	currency = "USD",
	teamId,
}: Props) {
	const supabase = await createClient();

	let lastMonthCents = 0;
	let mtdCents = 0;

	if (teamId) {
		try {
			const [{ data: prev, error: e1 }, { data: mtd, error: e2 }] =
				await Promise.all([
					supabase
						.rpc("monthly_spend_prev_cents", {
							p_team: teamId,
						})
						.single(),
					supabase
						.rpc("mtd_spend_cents", {
							p_team: teamId,
						})
						.single(),
				]);

			if (e1) console.log("[WARN] previous month spend:", e1);
			if (e2) console.log("[WARN] month-to-date spend:", e2);

			lastMonthCents = Number(prev ?? 0);
			mtdCents = Number(mtd ?? 0);
		} catch (err) {
			console.log("[ERROR] spend RPCs:", String(err));
		}
	}

        const lastMonth = lastMonthCents / 1_000_000_000;
        const mtd = mtdCents / 1_000_000_000;

	console.log("[TIER PROGRESS] lastMonth:", lastMonth, "mtd:", mtd);

	const tiers = GATEWAY_TIERS as GatewayTier[];
	const {
		current,
		currentIndex,
		topTier,
		remainingToNext,
		savingVsBase,
		projectedSavings,
		nextDiscountDelta,
		projectedIndex,
		projected,
	} = computeTierInfo({ lastMonth, mtd, tiers });

	const currentFee = current.feePct;

	const now = new Date();
	const dayOfMonth = now.getDate();
	const isLast4DaysOfMonth = dayOfMonth >= 28;
	const nextTier = tiers[currentIndex + 1];
	const within10PercentOfNext =
		nextTier &&
		remainingToNext > 0 &&
		remainingToNext / nextTier.threshold < 0.05;

	return (
		<Card>
			{/* HEADER — unchanged on desktop; stacks on small screens */}
			<CardHeader className="pb-2">
				<div className="flex flex-col gap-2 md:flex-row md:items-baseline md:justify-between">
					<CardTitle className="m-0">Tier Progress</CardTitle>
					<div className="text-sm text-muted-foreground md:text-right">
						Last month’s spend: {money(lastMonth, currency)}
					</div>
				</div>
			</CardHeader>

			<CardContent className="space-y-5">
				{/* TOP STRIP — keep design on desktop, stack on mobile */}
				<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
					<div className="space-y-1.5">
						<div className="text-[11px] uppercase tracking-wide text-muted-foreground">
							Current tier
						</div>
						<div className="flex items-center gap-2">
							<div className="text-lg font-semibold md:text-xl">
								{current.name}
							</div>
						</div>
						<p className="text-xs leading-relaxed text-muted-foreground md:max-w-[48ch]">
							{current.description}
						</p>
						{projectedSavings > 0 && (
							<p className="text-xs text-muted-foreground">
								~ {money(projectedSavings, currency)} saved on
								this month’s gateway spend versus Level 0
								pricing.
							</p>
						)}
					</div>

					<div className="space-y-1 text-left md:text-right">
						<div className="text-[11px] uppercase tracking-wide text-muted-foreground">
							Gateway fee
						</div>
						<div className="flex items-center justify-start gap-2 text-lg font-semibold md:justify-end md:text-xl">
							<span>{currentFee.toFixed(2)}%</span>

							{topTier ? (
								<Badge
									variant="secondary"
									className="text-[11px]"
								>
									Max tier
								</Badge>
							) : projected && projected.feePct !== currentFee ? (
								<>
									<ArrowRight className="h-4 w-4 text-muted-foreground" />
									<span>{projected.feePct.toFixed(2)}%</span>
								</>
							) : null}
						</div>
						<div
							className={cn(
								"text-xs",
								savingVsBase > 0
									? "text-emerald-600 dark:text-emerald-400"
									: "text-muted-foreground"
							)}
						>
							{savingVsBase > 0
								? `-${savingVsBase.toFixed(2)} pts vs Starter`
								: "Standard pricing"}
						</div>
					</div>
				</div>

				{isLast4DaysOfMonth && within10PercentOfNext && (
					<Alert>
						<AlertDescription>
							Only {money(remainingToNext, currency)} left to
							unlock {nextTier.name} tier!
						</AlertDescription>
					</Alert>
				)}

				{/* CHECKPOINTS — wraps into rows on mobile; 7 columns on md+ */}
				<div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-7 md:gap-2">
					{tiers.map((tier, idx) => {
						const reached = idx <= currentIndex;
						const isCurrent = idx === currentIndex;
						const isProjected = idx === projectedIndex;
						return (
							<div
								key={tier.key}
								className="flex flex-col items-center"
							>
								<div
									className={cn(
										"relative grid h-7 w-7 place-items-center rounded-full border sm:h-7 sm:w-7 md:h-6 md:w-6",
										reached
											? "border-indigo-600 bg-indigo-600 text-white"
											: "border-border bg-background text-muted-foreground",
										isProjected && !reached
											? "border-orange-500"
											: ""
									)}
									title={`${tier.name} ${
										reached
											? "reached"
											: isProjected
											? "projected"
											: "locked"
									}`}
									aria-label={`${tier.name} ${
										reached
											? "reached"
											: isProjected
											? "projected"
											: "locked"
									}`}
								>
									{reached ? (
										<Check
											className="h-4 w-4 md:h-3.5 md:w-3.5"
											aria-hidden
										/>
									) : (
										<Lock
											className="h-4 w-4 md:h-3.5 md:w-3.5"
											aria-hidden
										/>
									)}
									{isCurrent && (
										<span className="pointer-events-none absolute -inset-1 rounded-full ring-2 ring-indigo-300/70 dark:ring-indigo-500/40" />
									)}
								</div>
								<div className="mt-2 text-xs font-medium">
									{tier.name}
								</div>
								<div className="text-[11px] text-muted-foreground">
									{money(tier.threshold, currency)}
								</div>
								<div className="text-[11px] text-muted-foreground">
									Fee: {tier.feePct.toFixed(2)}%
								</div>
							</div>
						);
					})}
				</div>

				{/* LEGEND — wraps neatly on small screens */}
				<div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground md:gap-4">
					<div className="flex items-center gap-2">
						<span className="h-3 w-3 rounded-sm bg-indigo-600" />
						<span>Current tier</span>
					</div>
					<div className="flex items-center gap-2">
						<span className="h-3 w-3 rounded-sm border border-orange-500 bg-background" />
						<span>Projected for next month</span>
					</div>
				</div>

				<Separator />

				{/* BENEFITS — tighter padding on mobile; same info density on desktop */}
				<div>
					<div className="mb-2 text-sm font-medium">Benefits</div>
					<ul className="divide-y rounded-lg border">
						{tiers.map((tier, idx) => {
							const reached = idx <= currentIndex;
							const isProjected = idx === projectedIndex;
							return (
								<li
									key={tier.key}
									className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
								>
									<div className="flex items-start gap-3">
										<span
											className={cn(
												"grid h-6 w-6 place-items-center rounded-full border text-xs font-medium",
												reached
													? "border-indigo-600 bg-indigo-600 text-white"
													: "border-border bg-background text-muted-foreground",
												isProjected && !reached
													? "border-orange-500"
													: ""
											)}
											aria-hidden
										>
											{idx}
										</span>
										<div>
											<div className="text-sm font-medium">
												{tier.name}
											</div>
											<div className="text-xs text-muted-foreground">
												Threshold:{" "}
												{money(
													tier.threshold,
													currency
												)}
											</div>
											<div className="text-xs text-muted-foreground">
												{tier.description}
											</div>
										</div>
									</div>

									<div className="text-left sm:text-right">
										<div className="text-sm">
											Gateway fee:{" "}
											<span className="font-medium">
												{tier.feePct.toFixed(2)}%
											</span>
										</div>
										<div
											className={cn(
												"text-xs",
												reached
													? "text-emerald-600 dark:text-emerald-400"
													: isProjected
													? "text-orange-600 dark:text-orange-400"
													: "text-muted-foreground"
											)}
										>
											{reached
												? "Unlocked"
												: isProjected
												? "Projected"
												: "Locked"}
										</div>
									</div>
								</li>
							);
						})}
					</ul>
					<p className="mt-2 text-xs text-muted-foreground">
						Fees decrease as your monthly spend increases. We review
						your tier on the first of each month.
					</p>
					<p className="mt-2 text-xs text-muted-foreground">
						If you have questions about benefits or want help
						maximising your savings, please contact our support
						team.
					</p>
				</div>
			</CardContent>
		</Card>
	);
}
