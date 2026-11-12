import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { routeMetadataInput, toSerializableMetadata, type RouteMetadataInput } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import SubscriptionPlansPage, { getSubscriptionPlansMetadata } from "@/features/subscription-plans/SubscriptionPlansPage";
import SubscriptionPlansLoading from "@/features/subscription-plans/SubscriptionPlansLoading";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: RouteMetadataInput) => input)
	.handler(async ({ data }) => toSerializableMetadata(await getSubscriptionPlansMetadata(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/subscription-plans/")({
	loader: ({ params, location }) => metadataLoaderData(routeMetadata({ data: routeMetadataInput(params, location.search) })),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	pendingComponent: SubscriptionPlansLoading,
	component: SubscriptionPlansPage,
});
