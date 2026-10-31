// Next: src/app/[locale]/(dashboard)/settings/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { redirect } from "next/navigation";
import { metadataInput, runGenerateMetadata, type MetadataInput } from "@/lib/start/nextPage";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { nextPageComponent, withLoading } from "@/lib/start/nextPage";
import { localizePublicPath } from "@/lib/auth/localized-paths";
import { isPublicLocale, type PublicLocale } from "@/i18n/routing";
import Page, * as mod from "@/app/[locale]/(dashboard)/settings/page";
import Loading from "@/app/[locale]/(dashboard)/settings/loading";
import { getSettingsHeaderAccess } from "@/app/[locale]/(dashboard)/settings/settings.functions";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: MetadataInput) => input)
	.handler(({ data }) => runGenerateMetadata((mod as { generateMetadata?: Parameters<typeof runGenerateMetadata>[0] }).generateMetadata, metadataInput(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/")({
	beforeLoad: async ({ params }) => {
		const account = await getSettingsHeaderAccess();
		if (!account.available) return;
		const locale = params.locale ?? "en-GB";
		redirect(localizePublicPath((isPublicLocale(locale) ? locale : "en-GB") as PublicLocale, account.providerMode ? "/settings/account/providers" : "/settings/credits"));
	},
	loader: ({ params, location }) => metadataLoaderData(routeMetadata({ data: { params, search: location.search as Record<string, unknown> } })),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: withLoading(nextPageComponent(Page), Loading),
});
