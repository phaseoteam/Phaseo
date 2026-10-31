import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import DecisionsChatPage, { getDecisionsChatMetadata } from "@/features/chat/decisions/DecisionsChatPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getDecisionsChatMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/chat/decisions/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: DecisionsChatPage,
});
