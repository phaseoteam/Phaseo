"use client";

import dynamic from "next/dynamic";
import useSWR from "swr";
import { publicSWRKeys } from "@/lib/swr/keys";
import { fetchModelsPageData } from "@/lib/swr/models";

const ModelsDisplay = dynamic(() => import("./ModelsDisplay"), {
	ssr: false,
	loading: () => null,
});

export default function ModelsPageClient() {
	const { data, error } = useSWR(publicSWRKeys.models, fetchModelsPageData);

	if (error) throw error;
	if (!data) return null;

	return <ModelsDisplay modelsPageData={data} />;
}
