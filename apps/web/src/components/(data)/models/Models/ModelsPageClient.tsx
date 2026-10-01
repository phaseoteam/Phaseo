"use client";

import useSWR from "swr";
import { publicSWRKeys } from "@/lib/swr/keys";
import {
	fetchModelsPageData,
	fetchModelsPageDataV2,
} from "@/lib/swr/models";
import ModelsDisplay from "./ModelsDisplay";
import { ModelsPageSkeleton } from "./ModelsPageSkeleton";

type ModelsPageClientProps = {
	catalogueVersion?: "v1" | "v2";
	title: string;
};

export default function ModelsPageClient({
	catalogueVersion = "v1",
	title,
}: ModelsPageClientProps) {
	const swrKey =
		catalogueVersion === "v2" ? publicSWRKeys.modelsV2 : publicSWRKeys.models;
	const fetcher =
		catalogueVersion === "v2" ? fetchModelsPageDataV2 : fetchModelsPageData;
	const { data, error } = useSWR(swrKey, fetcher);

	if (error) throw error;
	if (!data) return <ModelsPageSkeleton title={title} />;

	return <ModelsDisplay modelsPageData={data} />;
}
