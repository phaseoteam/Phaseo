import type { ProviderPricing } from "@/lib/fetchers/models/getModelPricing";
import { formatProviderOfferVariantLabel } from "@/lib/providers/providerOffers";

function extractProviderIdFromModelKey(modelKey: string): string {
	const firstColon = modelKey.indexOf(":");
	if (firstColon <= 0) return "";
	return modelKey.slice(0, firstColon).trim();
}

export function getPricingProviderVariantLabels(args: {
	displayProvider: ProviderPricing;
	sourceProviders: ProviderPricing[];
}): string[] {
	const sourceProviderById = new Map(
		args.sourceProviders.map((provider) => [
			provider.provider.api_provider_id,
			provider.provider,
		]),
	);
	const sourceIds: string[] = [];
	const seenIds = new Set<string>();
	const pushSourceId = (value: string | null | undefined) => {
		const id = String(value ?? "").trim();
		if (!id || seenIds.has(id)) return;
		seenIds.add(id);
		sourceIds.push(id);
	};

	pushSourceId(args.displayProvider.provider.api_provider_id);
	for (const model of args.displayProvider.provider_models) {
		pushSourceId(model.api_provider_id);
	}
	for (const rule of args.displayProvider.pricing_rules) {
		pushSourceId(extractProviderIdFromModelKey(rule.model_key));
	}

	const labels: string[] = [];
	const seenLabels = new Set<string>();
	for (const sourceId of sourceIds) {
		const sourceProvider =
			sourceProviderById.get(sourceId) ??
			(sourceId === args.displayProvider.provider.api_provider_id
				? args.displayProvider.provider
				: null);
		const label = formatProviderOfferVariantLabel({
			offerLabel: sourceProvider?.offer_label ?? null,
			offerScope: sourceProvider?.offer_scope ?? null,
			providerId: sourceId,
		});
		if (!label || seenLabels.has(label)) continue;
		seenLabels.add(label);
		labels.push(label);
	}

	if (labels.length <= 1) {
		return [];
	}

	return labels;
}
