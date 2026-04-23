import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, TrendingDown, TrendingUp } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
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
	workspaceId?: string;
}

export default async function TierOverview({ workspaceId }: Props) {
	const supabase = await createClient();

	let lastMonthCents = 0;
	let mtdCents = 0;

	if (workspaceId) {
		try {
			const [{ data: prev }, { data: mtd }] = await Promise.all([
				supabase.rpc("monthly_spend_prev_cents", { p_team: workspaceId }).single(),
				supabase.rpc("mtd_spend_cents", { p_team: workspaceId }).single(),
			]);

			lastMonthCents = Number(prev ?? 0);
			mtdCents = Number(mtd ?? 0);
		} catch (err) {
			console.error("[TierOverview] Failed to fetch spend:", err);
		}
	}

	const lastMonth = lastMonthCents / 1_000_000_000;
	const mtd = mtdCents / 1_000_000_000;
	const currentFee = 5.0;

	return (
		<div className="grid gap-6 md:grid-cols-2">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center justify-between">
						<span>Current Pricing</span>
						<Badge variant="secondary" className="text-sm">
							Standard
						</Badge>
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex items-baseline justify-between">
						<span className="text-sm text-muted-foreground">Credit Top-Up Fee</span>
						<span className="text-3xl font-bold">{currentFee}%</span>
					</div>

					<div className="flex items-baseline justify-between">
						<span className="text-sm text-muted-foreground">Last Month Spend</span>
						<span className="font-semibold">{money(lastMonth)}</span>
					</div>

					<div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
						All workspaces are billed on the same 5% top-up fee with no enterprise tiering.
					</div>

					<Link
						href="https://docs.ai-stats.phaseo.app"
						className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
					>
						<span>Learn about pricing</span>
						<ExternalLink className="h-3 w-3" />
					</Link>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Spending Trends</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
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
											+{(((mtd - lastMonth) / lastMonth) * 100).toFixed(0)}% vs last month
										</span>
									</>
								) : mtd < lastMonth ? (
									<>
										<TrendingDown className="h-3 w-3 text-orange-600" />
										<span className="text-orange-600 dark:text-orange-400">
											{(((mtd - lastMonth) / lastMonth) * 100).toFixed(0)}% vs last month
										</span>
									</>
								) : (
									<span className="text-muted-foreground">Same as last month</span>
								)}
							</div>
						)}
					</div>

					<div className="space-y-1">
						<div className="flex items-center justify-between">
							<span className="text-sm text-muted-foreground">Last Month</span>
							<span className="font-semibold">{money(lastMonth)}</span>
						</div>
					</div>

					<div className="rounded-lg border bg-muted/50 p-3">
						<p className="text-sm text-muted-foreground">
							<strong>How pricing works:</strong> the 5% fee is applied when purchasing credits.
						</p>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
