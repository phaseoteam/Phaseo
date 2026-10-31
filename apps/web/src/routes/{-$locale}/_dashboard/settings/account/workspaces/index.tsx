import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import AccountWorkspacesPage, { getAccountWorkspacesMetadata } from "@/features/settings/account/workspaces/AccountWorkspacesPage";
import { redirect } from "@/i18n/navigation";
import { getSettingsHeaderAccess } from "@/features/settings/settings.functions";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getAccountWorkspacesMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/account/workspaces/")({
	beforeLoad: async ({ params }) => {
		if ((await getSettingsHeaderAccess()).providerMode) redirect({ href: "/settings/account/providers", locale: params.locale ?? "en-GB" });
	},
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: AccountWorkspacesPage,
});
