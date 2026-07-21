"use client";

import dynamic from "next/dynamic";
import useSWR from "swr";
import { ModelsPageSkeleton } from "./ModelsPageSkeleton";
import { publicSWRKeys } from "@/lib/swr/keys";
import {
	fetchModelsCatalogue,
	fetchModelsPricing,
	toModelsPageData,
} from "@/lib/swr/models";

const ModelsDisplay = dynamic(() => import("./ModelsDisplay"), {
	ssr: false,
	loading: () => <ModelsPageSkeleton />,
});

const MODELS_SWR_OPTIONS = {
	dedupingInterval: 5 * 60_000,
	revalidateOnFocus: false,
} as const;

export default function ModelsPageClient() {
	const {
		data: catalogue,
		error: catalogueError,
	} = useSWR(publicSWRKeys.models, fetchModelsCatalogue, MODELS_SWR_OPTIONS);
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
