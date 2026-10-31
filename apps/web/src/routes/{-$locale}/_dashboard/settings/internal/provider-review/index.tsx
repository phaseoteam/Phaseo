import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import ProviderReviewPage, { getProviderReviewMetadata } from "@/features/settings/internal/provider-review/ProviderReviewPage";
import { redirect } from "@/lib/navigation";
import { getSettingsInternalAdminStatus } from "@/features/settings/settings.functions";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getProviderReviewMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/internal/provider-review/")({
	// Internal admins only; others go to /settings/account/providers.
	beforeLoad: async () => {
		const status = await getSettingsInternalAdminStatus();
		if (!status.signedIn) redirect("/sign-in");
		if (!status.isAdmin) redirect("/settings/account/providers");
	},
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: ProviderReviewPage,
});
