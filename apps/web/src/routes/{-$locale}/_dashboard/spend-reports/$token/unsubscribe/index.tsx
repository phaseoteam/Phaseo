import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { routeMetadataInput, type RouteMetadataInput, toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import SpendReportUnsubscribePage, { getSpendReportUnsubscribeMetadata } from "@/features/spend-reports/token/unsubscribe/SpendReportUnsubscribePage";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: RouteMetadataInput) => input)
	.handler(async ({ data }) => toSerializableMetadata(await getSpendReportUnsubscribeMetadata(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/spend-reports/$token/unsubscribe/")({
	loader: ({ params, location }) => metadataLoaderData(routeMetadata({ data: routeMetadataInput(params, location.search) })),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: SpendReportUnsubscribePage,
});
