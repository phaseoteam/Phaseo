// Next: src/app/[locale]/(dashboard)/settings/usage/logs/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { metadataInput, runGenerateMetadata, type MetadataInput } from "@/lib/start/nextPage";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/settings/usage/logs/page";
import { redirect } from "@/i18n/navigation";
import { usageLogsRedirectHref } from "@/app/[locale]/(dashboard)/settings/usage/logs/page";
import type { UsageSearchParams } from "@/lib/query/privateUsage";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: MetadataInput) => input)
	.handler(({ data }) => runGenerateMetadata((mod as { generateMetadata?: Parameters<typeof runGenerateMetadata>[0] }).generateMetadata, metadataInput(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/usage/logs/")({
	beforeLoad: ({ params, search }) => {
		redirect({ href: usageLogsRedirectHref(search as UsageSearchParams), locale: params.locale ?? "en-GB" });
	},
	loader: ({ params, location }) => metadataLoaderData(routeMetadata({ data: { params, search: location.search as Record<string, unknown> } })),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: nextPageComponent(Page),
});
