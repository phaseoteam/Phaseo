"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "@/i18n/react";
import { Skeleton } from "@/components/ui/skeleton";
import { WEB_QUERY_POLICIES } from "@/lib/query/policies";
import { webQueryKeys } from "@/lib/query/queryKeys";
import { fetchPublicWebApi } from "@/lib/web-api/client";
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
const PRICING_HISTORY_DAYS = 3650;
const INSIGHTS_WINDOW_DAYS = 365;
// Matches the server's old per-series fallback: after this, show whatever has
// arrived and let slow or offline series fill in when they load.
const INSIGHTS_WAIT_MS = 2_500;

function providerWindowQuery(providerIds: string[]) {
	const query = new URLSearchParams();
	if (providerIds.length) query.set("provider_ids", [...new Set(providerIds)].sort().join(","));
	query.set("days", String(INSIGHTS_WINDOW_DAYS));
	return query.toString();
}

/**
 * The history, usage and effective-price series are below the fold and can be
 * hundreds of rows, so the page doesn't embed them: the browser loads them from
 * the Cloudflare web API. The URLs match the ones server renders used, so they
 * share Cloudflare's cache entries.
 */
function usePricingInsightsData(modelId: string, providerIds: string[], includeHidden: boolean) {
	const model = encodeURIComponent(modelId);
	const query = providerWindowQuery(providerIds);
	const history = useQuery<ModelPricingHistoryRule[]>({
		queryKey: webQueryKeys.public.modelPricingHistory(modelId),
		queryFn: async ({ signal }) =>
			(await fetchPublicWebApi<{ rules: ModelPricingHistoryRule[] }>(
				`/api/_web/models/${model}/pricing-history?days=${PRICING_HISTORY_DAYS}`,
				{ signal },
			)).rules,
		...WEB_QUERY_POLICIES.publicNoPolling,
		// The public API has no history for hidden models.
		enabled: !includeHidden,
	});
	const usage = useQuery<ModelUsageDailyBreakdownRow[]>({
		queryKey: webQueryKeys.public.modelPricingInsightsUsage(modelId, providerIds),
		queryFn: async ({ signal }) =>
			(await fetchPublicWebApi<{ rows: ModelUsageDailyBreakdownRow[] }>(`/api/_web/models/${model}/usage-daily?${query}`, { signal })).rows,
		...WEB_QUERY_POLICIES.publicNoPolling,
	});
	const effective = useQuery<ModelEffectivePricingDailyRow[]>({
		queryKey: webQueryKeys.public.modelEffectivePricingDaily(modelId, providerIds),
		queryFn: async ({ signal }) =>
			(await fetchPublicWebApi<{ rows: ModelEffectivePricingDailyRow[] }>(`/api/_web/models/${model}/effective-pricing-daily?${query}`, { signal })).rows,
		...WEB_QUERY_POLICIES.publicNoPolling,
	});
	const [waitedLongEnough, setWaitedLongEnough] = useState(false);
	useEffect(() => {
		const timer = setTimeout(() => setWaitedLongEnough(true), INSIGHTS_WAIT_MS);
		return () => clearTimeout(timer);
	}, []);
	// A failed or late series renders as empty, as it did when the server timed it out.
	const settled = waitedLongEnough || ((!history.isPending || includeHidden) && !usage.isPending && !effective.isPending);
	return {
		settled,
		historyRules: history.data ?? [],
		usageRows: usage.data ?? [],
		effectivePricingRows: effective.data ?? [],
	};
}

function getPreferredPlan(plans: string[]): string {
	if (plans.includes("standard")) return "standard";
	if (plans.includes("free")) return "free";
	return plans[0] || "standard";
}

export default function ModelPricingInsightsClient({
	modelId,
	providers,
	providerIds,
	includeHidden = false,
	showPageHeader = false,
}: {
	modelId: string;
	providers: ProviderPricing[];
	providerIds: string[];
	includeHidden?: boolean;
	showPageHeader?: boolean;
}) {
	const tPricing = useTranslations("Catalogue.modelDetail.pricing");
	const { settled, historyRules, usageRows, effectivePricingRows } = usePricingInsightsData(modelId, providerIds, includeHidden);
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
			{settled ? <PricingInsights
				providers={visibleProviders}
				plan={plan}
				availablePlans={availablePlans}
				onPlanChange={setSelectedPlan}
				showPlanInEffectiveHeader={false}
				historyRules={historyRules}
				usageRows={usageRows}
				effectivePricingRows={effectivePricingRows}
			/> : <Skeleton className="h-[34rem] w-full rounded-md" />}
		</div>
	);
}
