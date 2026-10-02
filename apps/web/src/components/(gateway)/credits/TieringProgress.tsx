import { DisplayMoneyMessage } from "./DisplayMoneyMessage";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowRight, Check, Lock, TrendingUp, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchCreditsTierSummary } from "@/lib/fetchers/internal/fetchCreditsTierSummary";
import {
	GATEWAY_TIERS,
	computeTierInfo,
	type GatewayTier,
} from "@/components/(gateway)/credits/tiers";
import { getTranslations } from "next-intl/server";
import { DisplayNumber } from "@/components/display/DisplayValue";

const HIDE_ENTERPRISE_REFERENCES = true;

function money(amount: number, currency: string) {
	return (
		<DisplayNumber
			value={amount}
			options={{
				style: "currency",
				currency,
				maximumFractionDigits: 0,
				notation: "standard",
			}}
		/>
	);
}

interface Props {
	teamId?: string;
	currency?: string;
}

export default async function TieringProgress({
	currency = "USD",
	teamId,
}: Props) {
	const t = await getTranslations("SettingsUI.credits");
	let lastMonthCents = 0;
	let mtdCents = 0;

	if (teamId) {
		try {
			const summary = await fetchCreditsTierSummary(teamId);
			lastMonthCents = summary.lastMonthCents;
			mtdCents = summary.mtdCents;
		} catch {
			// Keep the pricing tier card renderable with empty spend values.
		}
	}

	const lastMonth = lastMonthCents / 1_000_000_000;
	const mtd = mtdCents / 1_000_000_000;

	const tiers = GATEWAY_TIERS as GatewayTier[];
	const {
		current,
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

	if (HIDE_ENTERPRISE_REFERENCES) {
		return (
			<Card>
				<CardHeader className="pb-2">
					<div className="flex flex-col gap-2 md:flex-row md:items-baseline md:justify-between">
						<CardTitle className="m-0">{t("pricing")}</CardTitle>
						<div className="text-sm text-muted-foreground md:text-right">
							{t("lastMonth")}: {money(lastMonth, currency)}
						</div>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex items-center justify-between">
						<span className="text-sm text-muted-foreground">{t("currentTopUpFee")}</span>
						<span className="text-xl font-semibold">{currentFee.toFixed(1)}%</span>
					</div>
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<span className="text-sm text-muted-foreground">{t("thisMonth")}</span>
							<span className="text-sm font-medium">{money(mtd, currency)}</span>
						</div>
						<div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
							<div
								className="h-full bg-indigo-600 transition-all duration-300"
								style={{ width: `${progressPct}%` }}
							/>
						</div>
						<p className="text-xs text-muted-foreground">
							{<DisplayMoneyMessage messageKey={"spendMoreToThreshold"} amount={Math.max(enterpriseThreshold - mtd, 0)} currency={currency} />}.
						</p>
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader className="pb-2">
				<div className="flex flex-col gap-2 md:flex-row md:items-baseline md:justify-between">
					<CardTitle className="m-0">{t("pricingTier")}</CardTitle>
					<div className="text-sm text-muted-foreground md:text-right">
						{t("lastMonth")}: {money(lastMonth, currency)}
					</div>
				</div>
			</CardHeader>

			<CardContent className="space-y-5">
				{/* CURRENT TIER DISPLAY */}
				<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
					<div className="space-y-1.5">
						<div className="text-[11px] uppercase tracking-wide text-muted-foreground">
							{t("currentTierLower")}
						</div>
						<div className="flex items-center gap-2">
							<div className="text-lg font-semibold md:text-xl">
								{current.name}
							</div>
							{isEnterprise && (
								<Badge variant="secondary" className="text-[11px]">
									{t("premium")}
								</Badge>
							)}
						</div>
						<p className="text-xs leading-relaxed text-muted-foreground md:max-w-[48ch]">
							{current.description}
						</p>
						{projectedSavings > 0 && (
							<p className="text-xs text-emerald-600 dark:text-emerald-400">
							{<DisplayMoneyMessage messageKey={"savingVsBasic"} amount={projectedSavings} currency={currency} />}
							</p>
						)}
					</div>

					<div className="space-y-1 text-left md:text-right">
						<div className="text-[11px] uppercase tracking-wide text-muted-foreground">
							{t("topUpFee")}
						</div>
						<div className="flex items-center justify-start gap-2 text-lg font-semibold md:justify-end md:text-xl">
							<span>{currentFee.toFixed(1)}%</span>

							{willUpgradeNextMonth && projected.feePct !== currentFee && (
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
								? t("saveVsBasic", { percent: savingVsBase.toFixed(1) })
								: t("standardPricing")}
						</div>
					</div>
				</div>

				{/* UPGRADE ALERT (for Basic users near threshold) */}
				{!isEnterprise && remainingToNext > 0 && remainingToNext < enterpriseThreshold * 0.2 && (
					<Alert>
						<TrendingUp className="h-4 w-4" />
						<AlertDescription>
							{<DisplayMoneyMessage messageKey={"onlyAway"} amount={remainingToNext} currency={currency} />} {<DisplayMoneyMessage messageKey={"qualifyNextMonth"} amount={enterpriseThreshold} currency={currency} />}
						</AlertDescription>
					</Alert>
				)}

				{/* DOWNGRADE WARNING (for Enterprise users with low MTD) */}
				{willDowngradeRisk && (
					<Alert variant="destructive">
						<AlertTriangle className="h-4 w-4" />
						<AlertDescription>
							{<DisplayMoneyMessage messageKey={"belowThreshold"} amount={mtd} currency={currency} />} {<DisplayMoneyMessage messageKey={"maintainPricing"} amount={enterpriseThreshold} currency={currency} />} {t("downgradeNote")}
						</AlertDescription>
					</Alert>
				)}

				{/* SIMPLE TWO-TIER DISPLAY */}
				<div className="space-y-3">
					<div className="flex items-center justify-between">
						<span className="text-sm text-muted-foreground">
							{<DisplayMoneyMessage messageKey={"thisMonthAmount"} amount={mtd} currency={currency} />}
						</span>
						{!isEnterprise && (
							<span className="text-xs text-muted-foreground">
								{t("toEnterprise", { percent: progressPct.toFixed(0) })}
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
								{t("topUpFeePercent", { percent: basicTier.feePct.toFixed(1) })}
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
								{t("topUpFeePercent", { percent: enterpriseTier.feePct.toFixed(1) })}
							</div>
							<div className="mt-1 text-xs text-muted-foreground">
								{<DisplayMoneyMessage messageKey={"perMonth"} amount={enterpriseTier.threshold} currency={currency} />}
							</div>
							{willUpgradeNextMonth && (
								<Badge variant="outline" className="mt-2 text-[10px] border-orange-500 text-orange-600">
									{t("unlocking")}
								</Badge>
							)}
						</div>
					</div>
				</div>

				<Separator />

				{/* TIER DETAILS */}
				<div>
					<div className="mb-2 text-sm font-medium">{t("howItWorks")}</div>
					<div className="space-y-3 rounded-lg border p-4 text-sm">
						<div>
							<div className="font-medium">{t("basicTierFee")}</div>
							<p className="text-xs text-muted-foreground">
								{<DisplayMoneyMessage messageKey={"basicTierDescription"} amount={enterpriseThreshold} currency={currency} />}
							</p>
						</div>
						<div>
							<div className="font-medium">{t("enterpriseTierFee")}</div>
							<p className="text-xs text-muted-foreground">
								{<DisplayMoneyMessage messageKey={"enterpriseTierDescription"} amount={enterpriseThreshold} currency={currency} />}
							</p>
						</div>
					</div>
					<p className="mt-3 text-xs text-muted-foreground">
						{t("tiersUpdated")}
					</p>
					<p className="mt-2 text-xs text-muted-foreground">
						{t("questionsContact")}
					</p>
				</div>
			</CardContent>
		</Card>
	);
}
