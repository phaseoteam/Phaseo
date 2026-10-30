// Next: src/app/[locale]/(dashboard)/countries/[iso]/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { metadataInput, runGenerateMetadata, type MetadataInput } from "@/lib/start/nextPage";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/countries/[iso]/page";
import NotFound from "@/app/[locale]/(dashboard)/countries/[iso]/not-found";
import { countryQuery } from "@/app/[locale]/(dashboard)/countries/[iso]/page.queries";
import { notFound } from "next/navigation";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: MetadataInput) => input)
	.handler(({ data }) => runGenerateMetadata((mod as { generateMetadata?: Parameters<typeof runGenerateMetadata>[0] }).generateMetadata, metadataInput(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/countries/$iso/")({
	loader: async ({ params, location, context }) => {
		const metadataPromise = routeMetadata({ data: { params, search: location.search as Record<string, unknown> } });
		metadataPromise.catch(() => undefined);
		if (!(await context.queryClient.ensureQueryData(countryQuery(params.iso)))) notFound();
		return { metadata: await metadataPromise };
	},
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	notFoundComponent: NotFound,
	component: nextPageComponent(Page),
});
