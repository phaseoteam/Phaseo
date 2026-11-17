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
	// A retired or removed route no longer offers anything, so a provider whose
	// routes here are all retired (e.g. a discontinued "turbo" offer) must not
	// label the card, whether it shows up through a route or a pricing rule.
	const liveIds = new Set<string>();
	const retiredIds = new Set<string>();
	for (const model of args.displayProvider.provider_models) {
		const id = String(model.api_provider_id ?? "").trim();
		const routeStatus = String(model.routing_status ?? "").trim().toLowerCase();
		const availability = String(model.provider_availability_status ?? "").trim().toLowerCase();
		(routeStatus === "retired" || availability === "removed" ? retiredIds : liveIds).add(id);
	}
	const isRetiredOnly = (id: string) => retiredIds.has(id) && !liveIds.has(id);
	for (const model of args.displayProvider.provider_models) {
		if (!isRetiredOnly(String(model.api_provider_id ?? "").trim())) pushSourceId(model.api_provider_id);
	}
	for (const rule of args.displayProvider.pricing_rules) {
		const id = extractProviderIdFromModelKey(rule.model_key);
		if (!isRetiredOnly(id)) pushSourceId(id);
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
