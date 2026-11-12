import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { routeMetadataInput, type RouteMetadataInput, toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import GamePage, { getGameMetadata } from "@/features/games/game/GamePage";
import { getCatalogueGamesEnabled } from "@/features/games/page.functions";
import { isGameKey } from "@/lib/games/types";
import { notFound } from "@/lib/navigation";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: RouteMetadataInput) => input)
	.handler(async ({ data }) => toSerializableMetadata(await getGameMetadata(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/games/$game/")({
	beforeLoad: async ({ params }) => {
		if (!(await getCatalogueGamesEnabled())) notFound();
		if (!isGameKey(params.game)) notFound();
	},
	loader: ({ params, location }) => metadataLoaderData(routeMetadata({ data: routeMetadataInput(params, location.search) })),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: GamePage,
});
