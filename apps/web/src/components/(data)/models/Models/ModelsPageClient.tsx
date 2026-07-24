"use client";

import useSWR from "swr";
import { publicSWRKeys } from "@/lib/swr/keys";
import { fetchModelsPageData } from "@/lib/swr/models";
import ModelsDisplay from "./ModelsDisplay";
import { ModelsPageSkeleton } from "./ModelsPageSkeleton";

export default function ModelsPageClient() {
	const { data, error } = useSWR(publicSWRKeys.models, fetchModelsPageData);

	if (error) throw error;
	if (!data) return <ModelsPageSkeleton />;

	return <ModelsDisplay modelsPageData={data} />;
}
