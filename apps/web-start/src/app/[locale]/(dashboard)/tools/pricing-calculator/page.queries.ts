import { queryOptions } from "@tanstack/react-query";
import { fetchFrontendModels } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { fetchFrontendPricingModels } from "@/lib/fetchers/frontend/fetchFrontendPricingModels";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import type { PricingModel } from "@/lib/fetchers/pricing/getPricingModels";

// Only names, organisations and dates are read from the catalogue; prices and
// providers come from the gateway and pricing fetchers.
export const pricingCalculatorCatalogueQuery = () =>
	queryOptions({
		queryKey: ["public-catalog", "models", "no-gateway-data"],
		queryFn: () => fetchFrontendModels({ includeGatewayData: false }).catch(() => []),
	});

export const pricingCalculatorGatewayModelsQuery = () =>
	queryOptions({
		queryKey: ["public-catalog", "gateway-models", "pricing-calculator"],
		queryFn: () => fetchFrontendGatewayModels().catch(() => []),
	});

export const pricingCalculatorPricingModelsQuery = (modelIds: string[]) =>
	queryOptions({
		queryKey: ["public-catalog", "pricing-models", modelIds],
		queryFn: async (): Promise<PricingModel[]> =>
			modelIds.length > 0
				? await fetchFrontendPricingModels(modelIds).catch(() => [])
				: [],
	});
