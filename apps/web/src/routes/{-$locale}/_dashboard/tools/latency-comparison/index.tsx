import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { LatencyComparisonPage, getLatencyComparisonMetadata } from "@/features/tools/latency-comparison/LatencyComparisonPage";
import { getLatencyComparisonAccess } from "@/features/tools/latency-comparison/page.functions";
import { redirect } from "@/lib/navigation";

const routeMetadata = createServerFn({ method: "GET" })
	.handler(async () => toSerializableMetadata(await getLatencyComparisonMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/tools/latency-comparison/")({
	beforeLoad: async () => {
		const { redirectTo } = await getLatencyComparisonAccess();
		if (redirectTo) redirect(redirectTo);
	},
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: LatencyComparisonPage,
});
