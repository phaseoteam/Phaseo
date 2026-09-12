"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import { publicSWRKeys } from "@/lib/swr/keys";
import {
	fetchModelsTableData,
	fetchModelsTableDataV2,
} from "@/lib/swr/modelsTable";
import { useRevalidateOnResume } from "@/lib/swr/useRevalidateOnResume";
import { ModelsTablePageSkeleton } from "@/components/(data)/models/Models/ModelsTablePageSkeleton";

const ModelsTableDisplay = dynamic(() => import("./ModelsTableDisplay"), {
	loading: () => <ModelsTablePageSkeleton />,
});

type ModelsTablePageClientProps = {
	catalogueVersion?: "v1" | "v2";
};

export default function ModelsTablePageClient({
	catalogueVersion = "v1",
}: ModelsTablePageClientProps) {
	const swrKey =
		catalogueVersion === "v2"
			? publicSWRKeys.modelsTableV2
			: publicSWRKeys.modelsTable;
	const fetcher =
		catalogueVersion === "v2"
			? fetchModelsTableDataV2
			: fetchModelsTableData;
	const { data, error, mutate } = useSWR(swrKey, fetcher, {
		revalidateOnFocus: false,
		revalidateOnReconnect: false,
		refreshInterval: 2 * 60 * 1_000,
		refreshWhenHidden: false,
	});
	useRevalidateOnResume(mutate, error);
	useEffect(() => {
		void import("./ModelsTableDisplay");
	}, []);

	if (error && !data) throw error;
	if (!data) return <ModelsTablePageSkeleton />;

	return (
		<ModelsTableDisplay
			initialModelData={data.models}
			allEndpoints={data.allEndpoints}
			allModalities={data.allModalities}
			allFeatures={data.allFeatures}
			allStatuses={data.allStatuses}
		/>
	);
}
