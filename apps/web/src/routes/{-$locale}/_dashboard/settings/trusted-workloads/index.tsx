import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import TrustedWorkloadsPage, { getTrustedWorkloadsMetadata } from "@/features/settings/trusted-workloads/TrustedWorkloadsPage";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getTrustedWorkloadsMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/trusted-workloads/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: TrustedWorkloadsPage,
});
