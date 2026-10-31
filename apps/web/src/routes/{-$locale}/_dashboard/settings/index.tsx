import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { redirect } from "@/lib/navigation";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { localizePublicPath } from "@/lib/auth/localized-paths";
import { isPublicLocale, type PublicLocale } from "@/i18n/routing";
import SettingsPage, { getSettingsMetadata } from "@/features/settings/SettingsPage";
import SettingsLoading from "@/features/settings/SettingsLoading";
import { getSettingsHeaderAccess } from "@/features/settings/settings.functions";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getSettingsMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/")({
	beforeLoad: async ({ params }) => {
		const account = await getSettingsHeaderAccess();
		if (!account.available) return;
		const locale = params.locale ?? "en-GB";
		redirect(localizePublicPath((isPublicLocale(locale) ? locale : "en-GB") as PublicLocale, account.providerMode ? "/settings/account/providers" : "/settings/credits"));
	},
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: SettingsPage,
	pendingComponent: SettingsLoading,
});
