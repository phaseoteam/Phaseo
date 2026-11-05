import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import RankingsPage from "@/features/rankings/RankingsPage";
import RankingsLoading from "@/features/rankings/RankingsLoading";
import { getRankingsMetadata } from "@/features/rankings/RankingsPageContent";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getRankingsMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/rankings/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	pendingComponent: RankingsLoading,
	component: RankingsPage,
});
