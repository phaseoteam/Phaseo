"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import { publicSWRKeys } from "@/lib/swr/keys";
import {
	fetchModelsPageData,
	fetchModelsPageDataV2,
} from "@/lib/swr/models";
import { useRevalidateOnResume } from "@/lib/swr/useRevalidateOnResume";
import { ModelsPageSkeleton } from "./ModelsPageSkeleton";
import type { AuthenticatedProviderCatalogPreview } from "@/lib/swr/providerCatalogPreviews";

const ModelsDisplay = dynamic(() => import("./ModelsDisplay"), {
	loading: () => <ModelsPageSkeleton />,
});

type ModelsPageClientProps = {
	catalogueVersion?: "v1" | "v2";
	initialProviderPreviews?: AuthenticatedProviderCatalogPreview[];
};

export default function ModelsPageClient({
	catalogueVersion = "v1",
	initialProviderPreviews,
}: ModelsPageClientProps) {
	const swrKey =
		catalogueVersion === "v2" ? publicSWRKeys.modelsV2 : publicSWRKeys.models;
	const fetcher = (path: string) =>
		catalogueVersion === "v2"
			? fetchModelsPageDataV2(path, initialProviderPreviews)
			: fetchModelsPageData(path, initialProviderPreviews);
	const { data, error, mutate } = useSWR(swrKey, fetcher, {
		// The resume listener covers focus, restored tabs, and reconnects.
		revalidateOnFocus: false,
		revalidateOnReconnect: false,
		refreshInterval: 5 * 60_000,
	});
	useRevalidateOnResume(mutate, error);
	useEffect(() => {
		// Load the display code alongside the catalogue request, not after it.
		void import("./ModelsDisplay");
	}, []);

	if (error && !data) throw error;
	if (!data) return <ModelsPageSkeleton />;

	return <ModelsDisplay modelsPageData={data} />;
}
