import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import FamiliesPage, { getFamiliesMetadata } from "@/features/families/FamiliesPage";
import FamiliesLoading from "@/features/families/FamiliesLoading";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getFamiliesMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/families/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	pendingComponent: FamiliesLoading,
	component: FamiliesPage,
});
