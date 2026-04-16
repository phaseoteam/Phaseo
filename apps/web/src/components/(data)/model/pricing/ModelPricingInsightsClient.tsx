"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProviderPricing } from "@/lib/fetchers/models/getModelPricing";
import type { ProviderRuntimeStatsMap } from "@/lib/fetchers/models/getModelProviderRuntimeStats";
import type { ModelPricingHistoryRule } from "@/lib/fetchers/models/getModelPricingHistoryRules";
import PricingPlanSelect from "@/components/(data)/model/pricing/PricingPlanSelect";
import PricingInsights from "@/components/(data)/model/pricing/PricingInsights";

const PLAN_ORDER = ["free", "standard", "batch", "flex", "priority"];

function getPreferredPlan(plans: string[]): string {
	if (plans.includes("standard")) return "standard";
	if (plans.includes("free")) return "free";
	return plans[0] || "standard";
}

export default function ModelPricingInsightsClient({
	providers,
	runtimeStats,
	historyRules,
	showPageHeader = false,
}: {
	providers: ProviderPricing[];
	runtimeStats: ProviderRuntimeStatsMap;
	historyRules: ModelPricingHistoryRule[];
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

	const [plan, setPlan] = useState<string>(() => getPreferredPlan(availablePlans));

	useEffect(() => {
		if (!availablePlans.length) return;
		if (availablePlans.includes(plan)) return;
		setPlan(getPreferredPlan(availablePlans));
	}, [availablePlans, plan]);

	return (
		<div className={`space-y-4 ${showPageHeader ? "pt-1" : ""}`}>
			{showPageHeader ? (
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="space-y-1">
						<h1 className="text-2xl font-semibold tracking-tight">Pricing</h1>
						<p className="text-sm text-muted-foreground">
							Effective pricing across providers over the past hour and 30-day
							pricing history by meter.
						</p>
					</div>
					{availablePlans.length > 1 ? (
						<PricingPlanSelect
							value={plan}
							onChange={setPlan}
							plans={availablePlans}
						/>
					) : null}
				</div>
			) : null}
			<PricingInsights
				providers={providers}
				plan={plan}
				availablePlans={availablePlans}
				onPlanChange={setPlan}
				showPlanInEffectiveHeader={!showPageHeader}
				runtimeStats={runtimeStats}
				historyRules={historyRules}
			/>
		</div>
	);
}
