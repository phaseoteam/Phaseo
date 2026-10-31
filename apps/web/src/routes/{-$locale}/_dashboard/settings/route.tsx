import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { routeMetadataInput, type RouteMetadataInput, toSerializableMetadata } from "@/lib/start/metadata";
import { redirect } from "@/lib/navigation";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { isPublicLocale, type PublicLocale } from "@/i18n/routing";
import { localizeAuthPath } from "@/lib/auth/localized-paths";
import SettingsLayout, { getSettingsLayoutMetadata } from "@/features/settings/SettingsLayout";
import { settingsLayoutQuery } from "@/features/settings/settings.functions";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: RouteMetadataInput) => input)
	.handler(async ({ data }) => toSerializableMetadata(await getSettingsLayoutMetadata(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings")({
	// Signed-out visitors go to sign-in before anything renders.
	beforeLoad: async ({ context, params, location }) => {
		const data = await context.queryClient.ensureQueryData(settingsLayoutQuery());
		if (!data.signedIn) {
			const locale = (params.locale && isPublicLocale(params.locale) ? params.locale : "en-GB") as PublicLocale;
			const requestedPath = location.pathname || "/settings";
			const safeReturnUrl = requestedPath.startsWith("/") ? requestedPath : "/settings";
			redirect(`${localizeAuthPath(locale, "/sign-in")}?returnUrl=${encodeURIComponent(safeReturnUrl)}`);
		}
	},
	loader: ({ params, location }) => metadataLoaderData(routeMetadata({ data: routeMetadataInput(params, location.search) })),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: SettingsLayout,
});
