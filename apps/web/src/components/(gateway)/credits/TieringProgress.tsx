import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingDown, TrendingUp } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { GATEWAY_TIERS } from "@/components/(gateway)/credits/tiers";

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
			const [{ data: prev }, { data: mtd }] = await Promise.all([
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

			lastMonthCents = Number(prev ?? 0);
			mtdCents = Number(mtd ?? 0);
		} catch (err) {
			console.log("[TieringProgress] spend RPC failed:", String(err));
		}
	}

	const lastMonth = lastMonthCents / 1_000_000_000;
	const mtd = mtdCents / 1_000_000_000;
	const currentFee = GATEWAY_TIERS[0]?.feePct ?? 5;
	const deltaPct =
		lastMonth > 0 ? ((mtd - lastMonth) / Math.max(lastMonth, 1e-9)) * 100 : null;

	return (
		<Card>
			<CardHeader className="pb-2">
				<div className="flex flex-col gap-2 md:flex-row md:items-baseline md:justify-between">
					<CardTitle className="m-0">Pricing</CardTitle>
					<div className="text-sm text-muted-foreground md:text-right">
						Last month: {money(lastMonth, currency)}
					</div>
				</div>
			</CardHeader>

			<CardContent className="space-y-4">
				<div className="flex items-center justify-between">
					<span className="text-sm text-muted-foreground">Current top-up fee</span>
					<span className="text-xl font-semibold">{currentFee.toFixed(1)}%</span>
				</div>

				<div className="flex items-center justify-between">
					<span className="text-sm text-muted-foreground">This month</span>
					<span className="text-sm font-medium">{money(mtd, currency)}</span>
				</div>

				{deltaPct !== null ? (
					<div className="text-xs">
						{deltaPct > 0 ? (
							<span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
								<TrendingUp className="h-3.5 w-3.5" />
								+{deltaPct.toFixed(0)}% vs last month
							</span>
						) : deltaPct < 0 ? (
							<span className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400">
								<TrendingDown className="h-3.5 w-3.5" />
								{deltaPct.toFixed(0)}% vs last month
							</span>
						) : (
							<span className="text-muted-foreground">Same as last month</span>
						)}
					</div>
				) : null}

				<div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
					All workspaces use the same standard plan with a flat 5% top-up fee.
				</div>
			</CardContent>
		</Card>
	);
}
