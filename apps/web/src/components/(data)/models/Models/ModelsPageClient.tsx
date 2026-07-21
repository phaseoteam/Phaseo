"use client";

import useSWR from "swr";
import { ModelsPageSkeleton } from "./ModelsPageSkeleton";
import ModelsDisplay from "./ModelsDisplay";
import { publicSWRKeys } from "@/lib/swr/keys";
import {
	fetchModelsCatalogue,
	fetchModelsPricing,
	toModelsPageData,
	type ModelsCatalogueData,
} from "@/lib/swr/models";

interface ModelsPageClientProps {
	initialCatalogue?: ModelsCatalogueData;
}

const MODELS_SWR_OPTIONS = {
	dedupingInterval: 5 * 60_000,
	revalidateOnFocus: false,
} as const;

export default function ModelsPageClient({
	initialCatalogue,
}: ModelsPageClientProps) {
	const {
		data: catalogue,
		error: catalogueError,
	} = useSWR(publicSWRKeys.models, fetchModelsCatalogue, {
		...MODELS_SWR_OPTIONS,
		fallbackData: initialCatalogue,
	});
	const {
		data: pricing,
		error: pricingError,
	} = useSWR(publicSWRKeys.catalogPricing, fetchModelsPricing, {
		...MODELS_SWR_OPTIONS,
	});

	if (catalogueError) throw catalogueError;
	if (pricingError) throw pricingError;
	if (!catalogue) return <ModelsPageSkeleton />;

	return <ModelsDisplay modelsPageData={toModelsPageData(catalogue, pricing)} />;
}
