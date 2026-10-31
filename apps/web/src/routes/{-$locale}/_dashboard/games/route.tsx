import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import GamesLayout, { getGamesLayoutMetadata } from "@/features/games/GamesLayout";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getGamesLayoutMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/games")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: GamesLayout,
});
