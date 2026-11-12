import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { routeMetadataInput, toSerializableMetadata, type RouteMetadataInput } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { PrivacyPage, getPrivacyMetadata } from "@/features/privacy/PrivacyPage";
import { LegalLoading } from "@/features/legal/LegalLoading";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: RouteMetadataInput) => input)
	.handler(async ({ data }) => toSerializableMetadata(await getPrivacyMetadata(data)));

export const Route = createFileRoute("/{-$locale}/_legal/privacy/")({
	loader: ({ params, location }) => metadataLoaderData(routeMetadata({ data: routeMetadataInput(params, location.search) })),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: PrivacyPage,
	pendingComponent: LegalLoading,
});
