"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { ProviderPricing } from "@/lib/fetchers/models/getModelPricing";
import type { ModelPricingHistoryRule } from "@/lib/fetchers/models/getModelPricingHistoryRules";
import type { ModelUsageDailyBreakdownRow } from "@/lib/fetchers/models/getModelUsageDailyBreakdown";
import type { ModelEffectivePricingDailyRow } from "@/lib/fetchers/models/getModelEffectivePricingDaily";
import PricingPlanSelect from "@/components/(data)/model/pricing/PricingPlanSelect";
import PricingInsights from "@/components/(data)/model/pricing/PricingInsights";
import { subscribeProviderView } from "@/components/(data)/model/pricing/providerViewSync";
import { normalizeGatewayStatusValue } from "@/components/(data)/model/pricing/providerGatewayStatus";
import { getProviderAvailablePlans } from "@/components/(data)/model/pricing/providerPlanRouting";

const PLAN_ORDER = ["free", "standard", "priority", "ultrafast", "flex", "batch"];

function getPreferredPlan(plans: string[]): string {
	if (plans.includes("standard")) return "standard";
	if (plans.includes("free")) return "free";
	return plans[0] || "standard";
}

export default function ModelPricingInsightsClient({
	modelId,
	providers,
	historyRules,
	usageRows,
	effectivePricingRows,
	showPageHeader = false,
}: {
	modelId: string;
	providers: ProviderPricing[];
	historyRules: ModelPricingHistoryRule[];
	usageRows: ModelUsageDailyBreakdownRow[];
	effectivePricingRows: ModelEffectivePricingDailyRow[];
	showPageHeader?: boolean;
}) {
	const tPricing = useTranslations("Catalogue.modelDetail.pricing");
	const [providerView, setProviderView] = useState<string | null>(null);
	useEffect(() => subscribeProviderView(modelId, setProviderView), [modelId]);
	const visibleProviders = useMemo(() => {
		if (providerView === null) {
			return providers.filter((provider) =>
				normalizeGatewayStatusValue(provider.provider.status) !== "external",
			);
		}
		if (providerView === "none") return [];
		const visibleProviderIds = new Set(
			providerView.split(",").map((value) => value.trim()).filter(Boolean),
		);
		return providers.filter((provider) =>
			visibleProviderIds.has(provider.provider.api_provider_id),
		);
	}, [providerView, providers]);
	const availablePlans = useMemo(() => {
		const plans = new Set<string>();
		for (const provider of visibleProviders) {
			for (const plan of getProviderAvailablePlans(provider)) {
				plans.add(plan);
			}
		}
		return PLAN_ORDER.filter((plan) => plans.has(plan));
	}, [visibleProviders]);

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
						<h1 className="text-2xl font-semibold tracking-tight">{tPricing("title")}</h1>
						<p className="text-sm text-muted-foreground">
							{tPricing("overviewDescription")}
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
				providers={visibleProviders}
				plan={plan}
				availablePlans={availablePlans}
				onPlanChange={setSelectedPlan}
				showPlanInEffectiveHeader={false}
				historyRules={historyRules}
				usageRows={usageRows}
				effectivePricingRows={effectivePricingRows}
			/>
		</div>
	);
}
