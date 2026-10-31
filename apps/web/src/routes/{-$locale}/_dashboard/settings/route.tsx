// Next: src/app/[locale]/(dashboard)/settings/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { redirect } from "next/navigation";
import { metadataInput, runGenerateMetadata, type MetadataInput } from "@/lib/start/nextPage";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import { isPublicLocale, type PublicLocale } from "@/i18n/routing";
import { localizeAuthPath } from "@/lib/auth/localized-paths";
import Layout, * as mod from "@/app/[locale]/(dashboard)/settings/layout";
import { settingsLayoutQuery } from "@/app/[locale]/(dashboard)/settings/settings.functions";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: MetadataInput) => input)
	.handler(({ data }) => runGenerateMetadata((mod as { generateMetadata?: Parameters<typeof runGenerateMetadata>[0] }).generateMetadata, metadataInput(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings")({
	// Next's settings layout redirected signed-out visitors to sign-in before rendering.
	beforeLoad: async ({ context, params, location }) => {
		const data = await context.queryClient.ensureQueryData(settingsLayoutQuery());
		if (!data.signedIn) {
			const locale = (params.locale && isPublicLocale(params.locale) ? params.locale : "en-GB") as PublicLocale;
			const requestedPath = location.pathname || "/settings";
			const safeReturnUrl = requestedPath.startsWith("/") ? requestedPath : "/settings";
			redirect(`${localizeAuthPath(locale, "/sign-in")}?returnUrl=${encodeURIComponent(safeReturnUrl)}`);
		}
	},
	loader: ({ params, location }) => metadataLoaderData(routeMetadata({ data: { params, search: location.search as Record<string, unknown> } })),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: nextLayoutComponent(Layout),
});
