"use client";

import { useMemo, useState } from "react";
import type { ProviderPricing } from "@/lib/fetchers/models/getModelPricing";
import type { ModelPricingHistoryRule } from "@/lib/fetchers/models/getModelPricingHistoryRules";
import type { ModelUsageDailyBreakdownRow } from "@/lib/fetchers/models/getModelUsageDailyBreakdown";
import PricingPlanSelect from "@/components/(data)/model/pricing/PricingPlanSelect";
import PricingInsights from "@/components/(data)/model/pricing/PricingInsights";

const PLAN_ORDER = ["free", "standard", "priority", "flex", "batch"];

function getPreferredPlan(plans: string[]): string {
	if (plans.includes("standard")) return "standard";
	if (plans.includes("free")) return "free";
	return plans[0] || "standard";
}

export default function ModelPricingInsightsClient({
	providers,
	historyRules,
	usageRows,
	showPageHeader = false,
}: {
	providers: ProviderPricing[];
	historyRules: ModelPricingHistoryRule[];
	usageRows: ModelUsageDailyBreakdownRow[];
	showPageHeader?: boolean;
}) {
	const availablePlans = useMemo(() => {
		const plans = new Set<string>();
		for (const provider of providers) {
			for (const rule of provider.pricing_rules) {
				plans.add(rule.pricing_plan || "standard");
			}
		}
		return PLAN_ORDER.filter((plan) => plans.has(plan));
	}, [providers]);

	const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
	const plan =
		selectedPlan && availablePlans.includes(selectedPlan)
			? selectedPlan
			: getPreferredPlan(availablePlans);

	return (
		<div className={`space-y-4 ${showPageHeader ? "pt-1" : ""}`}>
			{showPageHeader ? (
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="space-y-1">
						<h1 className="text-2xl font-semibold tracking-tight">Pricing</h1>
						<p className="text-sm text-muted-foreground">
							List price is the headline provider rate per million tokens. Effective
							price is weighted by observed gateway traffic over the last 30 days.
						</p>
					</div>
					{availablePlans.length > 1 ? (
						<PricingPlanSelect
							value={plan}
							onChange={setSelectedPlan}
							plans={availablePlans}
						/>
					) : null}
				</div>
			) : null}
			<PricingInsights
				providers={providers}
				plan={plan}
				availablePlans={availablePlans}
				onPlanChange={setSelectedPlan}
				showPlanInEffectiveHeader={false}
				historyRules={historyRules}
				usageRows={usageRows}
			/>
		</div>
	);
}
