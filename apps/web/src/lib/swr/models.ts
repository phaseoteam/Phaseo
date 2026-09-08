import type {
	ModelsFilterFacets,
	ModelsPageData,
	ModelsPageModel,
} from "@/components/(data)/models/Models/modelsDisplay.types";
import { getCatalogPricingSummariesCached } from "@/lib/fetchers/models/getCatalogPricingSummaries";
import { withMissingCatalogPricing } from "@/lib/models/withMissingCatalogPricing";
import { publicSWRFetcher } from "@/lib/swr/publicFetcher";
import { fetchAuthenticatedPrivateModels } from "@/lib/swr/privateModels";

type PublicModelsResponse = {
	models: ModelsPageModel[];
	facets?: ModelsFilterFacets;
	pricing_complete?: boolean;
	catalogue_version?: "v1" | "v2";
	total: number;
	limit: number;
	offset: number;
};

type ModelsCatalogueVersion = "v1" | "v2";

async function fetchModelsPageDataForVersion(
	path: string,
	expectedVersion: ModelsCatalogueVersion,
): Promise<ModelsPageData> {
	const firstPage = await publicSWRFetcher<PublicModelsResponse>(path);
	if (
		firstPage.catalogue_version &&
		firstPage.catalogue_version !== expectedVersion
	) {
		throw new Error(
			`Models API returned catalogue ${firstPage.catalogue_version} for ${expectedVersion} request`,
		);
	}
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
	const privateModels = await fetchAuthenticatedPrivateModels<ModelsPageModel>("page");
	if (privateModels.length > 0) {
		const privateIds = new Set(privateModels.map((model) => model.model_id));
		models = [...privateModels, ...models.filter((model) => !privateIds.has(model.model_id))];
		const addFacet = (options: Array<{ value: string; count: number }>, value: string) => {
			const existing = options.find((option) => option.value === value);
			if (existing) existing.count += privateModels.length;
			else options.push({ value, count: privateModels.length });
		};
		firstPage.facets.statusCounts.active += privateModels.length;
		addFacet(firstPage.facets.creatorOptions, "Private");
		addFacet(firstPage.facets.tierOptions, "private");
	}

	return { models, facets: firstPage.facets };
}

export function fetchModelsPageData(path: string): Promise<ModelsPageData> {
	return fetchModelsPageDataForVersion(path, "v1");
}

export function fetchModelsPageDataV2(path: string): Promise<ModelsPageData> {
	return fetchModelsPageDataForVersion(path, "v2");
}
