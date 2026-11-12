import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { routeMetadataInput, type RouteMetadataInput, toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import SlackLinkPage, { getSlackLinkMetadata } from "@/features/slack/link/SlackLinkPage";
import { requireSlackLinkSession } from "@/features/slack/link/link.functions";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: RouteMetadataInput) => input)
	.handler(async ({ data }) => toSerializableMetadata(await getSlackLinkMetadata(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/slack/link/")({
	// Signed-out visitors go to sign-in (keeping the token) before rendering.
	beforeLoad: async ({ params, search }) => {
		const token = (search as Record<string, unknown>).token;
		await requireSlackLinkSession({ data: { locale: params.locale ?? "en-GB", token: typeof token === "string" ? token : "" } });
	},
	loader: ({ params, location }) => metadataLoaderData(routeMetadata({ data: routeMetadataInput(params, location.search) })),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: SlackLinkPage,
});
