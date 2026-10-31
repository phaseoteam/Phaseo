import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import AutoRoutingPage, { getAutoRoutingMetadata } from "@/features/settings/routing/auto/AutoRoutingPage";
import { notFound } from "@/lib/navigation";
import { settingsFlagQuery } from "@/features/settings/settings.functions";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getAutoRoutingMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/routing/auto/")({
	beforeLoad: async ({ context }) => {
		if (!(await context.queryClient.ensureQueryData(settingsFlagQuery("autoRouting")))) notFound();
	},
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: AutoRoutingPage,
});
