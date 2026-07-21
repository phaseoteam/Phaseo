import type {
	ModelsFilterFacets,
	ModelsPageData,
	ModelsPageModel,
} from "@/components/(data)/models/Models/modelsDisplay.types";
import {
	getCatalogPricingSummariesCached,
	getCatalogPricingSummariesWithCacheMode,
	type CatalogPricingSummaryByModelId,
} from "@/lib/fetchers/models/getCatalogPricingSummaries";
import { withMissingCatalogPricing } from "@/lib/models/withMissingCatalogPricing";
import { publicSWRFetcher } from "@/lib/swr/publicFetcher";

type PublicModelsResponse = {
	models: ModelsPageModel[];
	facets?: ModelsFilterFacets;
	pricing_complete?: boolean;
	total: number;
	limit: number;
	offset: number;
};

export type ModelsCatalogueData = {
	models: ModelsPageModel[];
	facets: ModelsFilterFacets;
	pricingComplete: boolean;
};

export async function fetchModelsCatalogue(path: string): Promise<ModelsCatalogueData> {
	const firstPage = await publicSWRFetcher<PublicModelsResponse>(path);
	const pageSize = Math.max(1, firstPage.limit || 2_000);
	const pageOffsets: number[] = [];
	for (let offset = pageSize; offset < firstPage.total; offset += pageSize) {
		pageOffsets.push(offset);
	}

	const laterPages = await Promise.all(
		pageOffsets.map((offset) => {
			const url = new URL(path, "https://phaseo.local");
			url.searchParams.set("offset", String(offset));
			return publicSWRFetcher<PublicModelsResponse>(`${url.pathname}${url.search}`);
		}),
	);
	const models = [firstPage, ...laterPages]
		.flatMap((page) => page.models)
		.filter((model) => Boolean(model.model_id));

	if (!firstPage.facets) {
		throw new Error("Models API response did not include filter facets");
	}

	return {
		models,
		facets: firstPage.facets,
		pricingComplete: firstPage.pricing_complete === true,
	};
}

export async function fetchModelsPricing(
	_path: string,
): Promise<CatalogPricingSummaryByModelId> {
	// Unlike the server-side fetcher, the browser may reuse the endpoint's
	// public HTTP cache. SWR provides the in-memory cache on top of that.
	return getCatalogPricingSummariesWithCacheMode("default");
}

export function toModelsPageData(
	catalogue: ModelsCatalogueData,
	pricing?: CatalogPricingSummaryByModelId,
): ModelsPageData {
	return {
		models:
			catalogue.pricingComplete || !pricing
				? catalogue.models
				: withMissingCatalogPricing(catalogue.models, pricing),
		facets: catalogue.facets,
	};
}

export async function fetchModelsPageData(path: string): Promise<ModelsPageData> {
	const catalogue = await fetchModelsCatalogue(path);
	const pricing = catalogue.pricingComplete
		? undefined
		: await getCatalogPricingSummariesCached();
	return toModelsPageData(catalogue, pricing);
}
