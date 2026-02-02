import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, ExternalLink, Sparkles } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { cn } from "@/lib/utils";
import Link from "next/link";

function money(amount: number, currency: string = "USD") {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency,
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(amount);
}

interface Props {
	teamId?: string;
}

export default async function TierOverview({ teamId }: Props) {
	const supabase = await createClient();

	// Fetch spending data
	let lastMonthCents = 0;
	let mtdCents = 0;

	if (teamId) {
		try {
			const [{ data: prev }, { data: mtd }] = await Promise.all([
				supabase.rpc("monthly_spend_prev_cents", { p_team: teamId }).single(),
				supabase.rpc("mtd_spend_cents", { p_team: teamId }).single(),
			]);

			lastMonthCents = Number(prev ?? 0);
			mtdCents = Number(mtd ?? 0);
		} catch (err) {
			console.error("[TierOverview] Failed to fetch spend:", err);
		}
	}

	const lastMonth = lastMonthCents / 1_000_000_000;
	const mtd = mtdCents / 1_000_000_000;

	// Tier calculation
	const enterpriseThreshold = 10000;
	const isEnterprise = lastMonth >= enterpriseThreshold;
	const currentTier = isEnterprise ? "Enterprise" : "Basic";
	const currentFee = isEnterprise ? 5.0 : 7.0;
	const savingsRate = isEnterprise ? 2.0 : 0;

	// Progress toward Enterprise (for Basic users)
	const progressPct = isEnterprise
		? 100
		: Math.min(100, (mtd / enterpriseThreshold) * 100);
	const remainingToEnterprise = Math.max(0, enterpriseThreshold - mtd);

	// Estimated savings this month
	const estimatedSavings = isEnterprise ? mtd * 0.02 : 0; // 2% savings

	return (
		<div className="grid gap-6 md:grid-cols-2">
			{/* Current Tier Card */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center justify-between">
						<span>Current Tier</span>
						<Badge
							variant={isEnterprise ? "default" : "secondary"}
							className={cn(
								"text-sm",
								isEnterprise &&
									"bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500"
							)}
						>
							{currentTier}
						</Badge>
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{/* Fee Rate */}
					<div className="flex items-baseline justify-between">
						<span className="text-sm text-muted-foreground">Gateway Fee</span>
						<div className="flex items-baseline gap-1">
							<span className="text-3xl font-bold">{currentFee}%</span>
							{savingsRate > 0 && (
								<span className="text-sm text-emerald-600 dark:text-emerald-400">
									(-{savingsRate}%)
								</span>
							)}
						</div>
					</div>

					{/* Last Month Spend */}
					<div className="flex items-baseline justify-between">
						<span className="text-sm text-muted-foreground">
							Last Month Spend
						</span>
						<span className="font-semibold">{money(lastMonth)}</span>
					</div>

					{/* This Month Progress */}
					{!isEnterprise && (
						<div className="space-y-2">
							<div className="flex items-baseline justify-between text-sm">
								<span className="text-muted-foreground">
									Progress to Enterprise
								</span>
								<span className="font-medium">{progressPct.toFixed(0)}%</span>
							</div>
							<Progress value={progressPct} className="h-2" />
							<p className="text-xs text-muted-foreground">
								{remainingToEnterprise > 0 ? (
									<>
										Spend {money(remainingToEnterprise)} more this month to
										unlock Enterprise tier (5% fee)
									</>
								) : (
									<>Eligible for Enterprise tier next month!</>
								)}
							</p>
						</div>
					)}

					{/* Savings for Enterprise */}
					{isEnterprise && estimatedSavings > 0 && (
						<div className="rounded-lg bg-emerald-50 p-3 dark:bg-emerald-950/30">
							<div className="flex items-center gap-2 text-sm">
								<Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
								<span className="font-medium text-emerald-900 dark:text-emerald-100">
									Saving ~{money(estimatedSavings)} this month vs Basic
								</span>
							</div>
						</div>
					)}

					{/* Learn More Link */}
					<Link
						href="/docs/pricing/tiers"
						className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
					>
						<span>Learn about tiers and pricing</span>
						<ExternalLink className="h-3 w-3" />
					</Link>
				</CardContent>
			</Card>

			{/* Spending Trends Card */}
			<Card>
				<CardHeader>
					<CardTitle>Spending Trends</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{/* This Month */}
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<span className="text-sm text-muted-foreground">This Month</span>
							<span className="text-2xl font-bold">{money(mtd)}</span>
						</div>
						{lastMonth > 0 && (
							<div className="flex items-center gap-1 text-xs">
								{mtd > lastMonth ? (
									<>
										<TrendingUp className="h-3 w-3 text-emerald-600" />
										<span className="text-emerald-600 dark:text-emerald-400">
											+{(((mtd - lastMonth) / lastMonth) * 100).toFixed(0)}%
											vs last month
										</span>
									</>
								) : mtd < lastMonth ? (
									<>
										<TrendingDown className="h-3 w-3 text-orange-600" />
										<span className="text-orange-600 dark:text-orange-400">
											{(((mtd - lastMonth) / lastMonth) * 100).toFixed(0)}%
											vs last month
										</span>
									</>
								) : (
									<span className="text-muted-foreground">
										Same as last month
									</span>
								)}
							</div>
						)}
					</div>

					{/* Last Month */}
					<div className="space-y-1">
						<div className="flex items-center justify-between">
							<span className="text-sm text-muted-foreground">Last Month</span>
							<span className="font-semibold">{money(lastMonth)}</span>
						</div>
					</div>

					{/* Tier Explanation */}
					<div className="rounded-lg border bg-muted/50 p-3">
						<p className="text-sm text-muted-foreground">
							<strong>How tiers work:</strong> Your tier is based on rolling
							30-day spend. Reach $10k to unlock Enterprise pricing (5% fee).
							Basic tier is 7%. Automatic with no commitments required.
						</p>
					</div>

					{/* Grace Period Notice (for Enterprise users at risk) */}
					{isEnterprise && mtd < enterpriseThreshold && (
						<div className="rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-900 dark:bg-orange-950/30">
							<p className="text-sm text-orange-900 dark:text-orange-100">
								<strong>Heads up:</strong> Your spending is below $10k this
								month. You'll keep Enterprise pricing with a 3-month grace
								period.
							</p>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
