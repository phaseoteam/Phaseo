// Next: src/app/[locale]/(dashboard)/settings/byok/[providerId]/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { metadataInput, runGenerateMetadata, type MetadataInput } from "@/lib/start/nextPage";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { nextPageComponent, withLoading } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/settings/byok/[providerId]/page";
import Loading from "@/app/[locale]/(dashboard)/settings/byok/[providerId]/loading";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: MetadataInput) => input)
	.handler(({ data }) => runGenerateMetadata((mod as { generateMetadata?: Parameters<typeof runGenerateMetadata>[0] }).generateMetadata, metadataInput(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/byok/$providerId/")({
	loader: async ({ params, location }) => ({ metadata: await routeMetadata({ data: { params, search: location.search as Record<string, unknown> } }) }),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: withLoading(nextPageComponent(Page), Loading),
});
