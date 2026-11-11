import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import RankingsModalityPage from "@/features/rankings/modality/RankingsModalityPage";
import { getRankingsMetadata } from "@/features/rankings/RankingsPageContent";

// Every modality page shares the rankings metadata.
const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getRankingsMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/rankings/$modality/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: RankingsModalityPage,
});
