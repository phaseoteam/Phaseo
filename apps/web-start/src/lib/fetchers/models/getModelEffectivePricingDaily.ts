import { fetchPublicWebApi } from "@/lib/web-api/client";

export type ModelEffectivePricingDailyRow = {
	dayBucket: string;
	providerId: string;
	pricingPlan: string;
	inputTokens: number;
	outputTokens: number;
	cachedReadTokens: number;
	cachedWriteTokens: number;
	inputCostNanos: number;
	outputCostNanos: number;
	totalCostNanos: number;
};

export async function getModelEffectivePricingDaily(args: {
	modelId: string;
	providerIds?: string[];
	days?: number;
}): Promise<ModelEffectivePricingDailyRow[]> {
	const query = new URLSearchParams();
	if (args.providerIds?.length) query.set("provider_ids", [...new Set(args.providerIds)].sort().join(","));
	if (args.days != null) query.set("days", String(args.days));
	return (await fetchPublicWebApi<{ rows: ModelEffectivePricingDailyRow[] }>(
		`/api/_web/models/${encodeURIComponent(args.modelId)}/effective-pricing-daily?${query.toString()}`,
	)).rows;
}
