// Next: src/app/[locale]/(dashboard)/settings/internal/provider-review/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { metadataInput, runGenerateMetadata, type MetadataInput } from "@/lib/start/nextPage";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/settings/internal/provider-review/page";
import { redirect } from "@/lib/navigation";
import { getSettingsInternalAdminStatus } from "@/app/[locale]/(dashboard)/settings/settings.functions";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: MetadataInput) => input)
	.handler(({ data }) => runGenerateMetadata((mod as { generateMetadata?: Parameters<typeof runGenerateMetadata>[0] }).generateMetadata, metadataInput(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/internal/provider-review/")({
	// Next: requireInternalAdmin("/settings/account/providers").
	beforeLoad: async () => {
		const status = await getSettingsInternalAdminStatus();
		if (!status.signedIn) redirect("/sign-in");
		if (!status.isAdmin) redirect("/settings/account/providers");
	},
	loader: ({ params, location }) => metadataLoaderData(routeMetadata({ data: { params, search: location.search as Record<string, unknown> } })),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: nextPageComponent(Page),
});
