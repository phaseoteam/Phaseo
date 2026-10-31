import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import ProfilePage, { getProfileMetadata } from "@/features/settings/profile/ProfilePage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getProfileMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/profile/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: ProfilePage,
});
