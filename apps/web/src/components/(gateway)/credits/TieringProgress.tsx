import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowRight, Check, Lock, TrendingUp, AlertTriangle } from "lucide-react";
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
		projected,
		isEnterprise,
		willUpgradeNextMonth,
		willDowngradeRisk,
	} = computeTierInfo({ lastMonth, mtd, tiers });

	const currentFee = current.feePct;
	const [basicTier, enterpriseTier] = tiers;
	const enterpriseThreshold = enterpriseTier.threshold;

	// Calculate progress percentage for Basic users
	const progressPct = isEnterprise ? 100 : Math.min(100, (mtd / enterpriseThreshold) * 100);

	return (
		<Card>
			<CardHeader className="pb-2">
				<div className="flex flex-col gap-2 md:flex-row md:items-baseline md:justify-between">
					<CardTitle className="m-0">Pricing Tier</CardTitle>
					<div className="text-sm text-muted-foreground md:text-right">
						Last month: {money(lastMonth, currency)}
					</div>
				</div>
			</CardHeader>

			<CardContent className="space-y-5">
				{/* CURRENT TIER DISPLAY */}
				<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
					<div className="space-y-1.5">
						<div className="text-[11px] uppercase tracking-wide text-muted-foreground">
							Current tier
						</div>
						<div className="flex items-center gap-2">
							<div className="text-lg font-semibold md:text-xl">
								{current.name}
							</div>
							{isEnterprise && (
								<Badge variant="secondary" className="text-[11px]">
									Premium
								</Badge>
							)}
						</div>
						<p className="text-xs leading-relaxed text-muted-foreground md:max-w-[48ch]">
							{current.description}
						</p>
						{projectedSavings > 0 && (
							<p className="text-xs text-emerald-600 dark:text-emerald-400">
								💰 Saving ~{money(projectedSavings, currency)} this month vs Basic pricing
							</p>
						)}
					</div>

					<div className="space-y-1 text-left md:text-right">
						<div className="text-[11px] uppercase tracking-wide text-muted-foreground">
							Gateway fee
						</div>
						<div className="flex items-center justify-start gap-2 text-lg font-semibold md:justify-end md:text-xl">
							<span>{currentFee.toFixed(1)}%</span>

							{willUpgradeNextMonth && (
								<>
									<ArrowRight className="h-4 w-4 text-orange-500" />
									<span className="text-orange-600 dark:text-orange-400">
										{projected.feePct.toFixed(1)}%
									</span>
								</>
							)}
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
								? `Save ${savingVsBase.toFixed(1)}% vs Basic`
								: "Standard pricing"}
						</div>
					</div>
				</div>

				{/* UPGRADE ALERT (for Basic users near threshold) */}
				{!isEnterprise && remainingToNext > 0 && remainingToNext < enterpriseThreshold * 0.2 && (
					<Alert>
						<TrendingUp className="h-4 w-4" />
						<AlertDescription>
							Only {money(remainingToNext, currency)} away from Enterprise tier!
							Spend {money(enterpriseThreshold, currency)}+ this month to unlock 5% pricing next month.
						</AlertDescription>
					</Alert>
				)}

				{/* DOWNGRADE WARNING (for Enterprise users with low MTD) */}
				{willDowngradeRisk && (
					<Alert variant="destructive">
						<AlertTriangle className="h-4 w-4" />
						<AlertDescription>
							Your month-to-date spend ({money(mtd, currency)}) is below the Enterprise threshold.
							Spend {money(enterpriseThreshold, currency)}+ to maintain Enterprise pricing.
							Note: Tier downgrades occur after 3 consecutive months below threshold.
						</AlertDescription>
					</Alert>
				)}

				{/* SIMPLE TWO-TIER DISPLAY */}
				<div className="space-y-3">
					<div className="flex items-center justify-between">
						<span className="text-sm text-muted-foreground">
							This month: {money(mtd, currency)}
						</span>
						{!isEnterprise && (
							<span className="text-xs text-muted-foreground">
								{progressPct.toFixed(0)}% to Enterprise
							</span>
						)}
					</div>

					{/* PROGRESS BAR (for Basic users) */}
					{!isEnterprise && (
						<div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
							<div
								className="h-full bg-indigo-600 transition-all duration-300"
								style={{ width: `${progressPct}%` }}
							/>
						</div>
					)}

					{/* TIER CHECKPOINTS */}
					<div className="grid grid-cols-2 gap-4">
						{/* Basic Tier */}
						<div className="flex flex-col items-center rounded-lg border p-4">
							<div
								className={cn(
									"mb-2 grid h-10 w-10 place-items-center rounded-full border-2",
									!isEnterprise
										? "border-indigo-600 bg-indigo-600 text-white"
										: "border-muted-foreground/30 bg-muted text-muted-foreground"
								)}
							>
								<Check className="h-5 w-5" />
							</div>
							<div className="text-sm font-semibold">{basicTier.name}</div>
							<div className="text-xs text-muted-foreground">
								{basicTier.feePct.toFixed(1)}% fee
							</div>
							<div className="mt-1 text-xs text-muted-foreground">
								{money(basicTier.threshold, currency)}+
							</div>
						</div>

						{/* Enterprise Tier */}
						<div className="flex flex-col items-center rounded-lg border p-4">
							<div
								className={cn(
									"mb-2 grid h-10 w-10 place-items-center rounded-full border-2",
									isEnterprise
										? "border-indigo-600 bg-indigo-600 text-white"
										: willUpgradeNextMonth
										? "border-orange-500 bg-orange-500/10 text-orange-600"
										: "border-muted-foreground/30 bg-muted text-muted-foreground"
								)}
							>
								{isEnterprise ? (
									<Check className="h-5 w-5" />
								) : (
									<Lock className="h-5 w-5" />
								)}
							</div>
							<div className="text-sm font-semibold">{enterpriseTier.name}</div>
							<div className="text-xs text-muted-foreground">
								{enterpriseTier.feePct.toFixed(1)}% fee
							</div>
							<div className="mt-1 text-xs text-muted-foreground">
								{money(enterpriseTier.threshold, currency)}+/mo
							</div>
							{willUpgradeNextMonth && (
								<Badge variant="outline" className="mt-2 text-[10px] border-orange-500 text-orange-600">
									Unlocking
								</Badge>
							)}
						</div>
					</div>
				</div>

				<Separator />

				{/* TIER DETAILS */}
				<div>
					<div className="mb-2 text-sm font-medium">How it works</div>
					<div className="space-y-3 rounded-lg border p-4 text-sm">
						<div>
							<div className="font-medium">✓ Basic Tier (7%)</div>
							<p className="text-xs text-muted-foreground">
								All teams start here. Automatic upgrade after spending {money(enterpriseThreshold, currency)}+ in any month.
							</p>
						</div>
						<div>
							<div className="font-medium">✓ Enterprise Tier (5%)</div>
							<p className="text-xs text-muted-foreground">
								High-volume teams save 2% on all requests. Maintained while spending {money(enterpriseThreshold, currency)}+ monthly.
								Downgrade to Basic after 3 consecutive months below threshold.
							</p>
						</div>
					</div>
					<p className="mt-3 text-xs text-muted-foreground">
						💡 Tiers are automatically updated on the 1st of each month based on the previous month's spend.
					</p>
					<p className="mt-2 text-xs text-muted-foreground">
						Questions? Contact support for custom pricing or volume discounts.
					</p>
				</div>
			</CardContent>
		</Card>
	);
}
