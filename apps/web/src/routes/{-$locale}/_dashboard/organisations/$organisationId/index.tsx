// Next: src/app/[locale]/(dashboard)/organisations/[organisationId]/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { metadataInput, runGenerateMetadata, type MetadataInput } from "@/lib/start/nextPage";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/organisations/[organisationId]/page";
import NotFound from "@/app/[locale]/(dashboard)/organisations/[organisationId]/not-found";
import { organisationQuery } from "@/app/[locale]/(dashboard)/organisations/[organisationId]/page.queries";
import { notFound } from "@/lib/navigation";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: MetadataInput) => input)
	.handler(({ data }) => runGenerateMetadata((mod as { generateMetadata?: Parameters<typeof runGenerateMetadata>[0] }).generateMetadata, metadataInput(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/organisations/$organisationId/")({
	loader: async ({ params, location, context }) => {
		const metadataPromise = routeMetadata({ data: { params, search: location.search as Record<string, unknown> } });
		metadataPromise.catch(() => undefined);
		if (!(await context.queryClient.ensureQueryData(organisationQuery(params.organisationId, 12)))) notFound();
		return metadataLoaderData(metadataPromise);
	},
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	notFoundComponent: NotFound,
	component: nextPageComponent(Page),
});
