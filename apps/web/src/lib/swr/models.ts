import type {
	ModelsFilterFacets,
	ModelsPageData,
	ModelsPageModel,
} from "@/components/(data)/models/Models/modelsDisplay.types";
import { getCatalogPricingSummariesCached } from "@/lib/fetchers/models/getCatalogPricingSummaries";
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

export async function fetchModelsPageData(path: string): Promise<ModelsPageData> {
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
	let models = [firstPage, ...laterPages]
		.flatMap((page) => page.models)
		.filter((model) => Boolean(model.model_id));

	if (firstPage.pricing_complete !== true) {
		models = withMissingCatalogPricing(
			models,
			await getCatalogPricingSummariesCached(),
		);
	}

	if (!firstPage.facets) {
		throw new Error("Models API response did not include filter facets");
	}

	return { models, facets: firstPage.facets };
}
