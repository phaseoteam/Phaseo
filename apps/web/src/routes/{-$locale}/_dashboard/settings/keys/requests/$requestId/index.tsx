import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import KeyRequestPage, { getKeyRequestMetadata } from "@/features/settings/keys/requests/requestId/KeyRequestPage";
import { keyRequestQuery } from "@/features/settings/keys/requests/requestId/keyRequest.functions";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getKeyRequestMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/keys/requests/$requestId/")({
	loader: ({ context, params }) => {
		void context.queryClient.prefetchQuery(keyRequestQuery(params.requestId));
		return metadataLoaderData(routeMetadata());
	},
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: KeyRequestPage,
});
