import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { routeMetadataInput, toSerializableMetadata, type RouteMetadataInput } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import CountryPage, { getCountryMetadata } from "@/features/countries/iso/CountryPage";
import CountryNotFound from "@/features/countries/iso/CountryNotFound";
import { countryQuery } from "@/features/countries/iso/page.queries";
import { notFound } from "@/lib/navigation";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: RouteMetadataInput) => input)
	.handler(async ({ data }) => toSerializableMetadata(await getCountryMetadata(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/countries/$iso/")({
	loader: async ({ params, location, context }) => {
		const metadataPromise = routeMetadata({ data: routeMetadataInput(params, location.search) });
		metadataPromise.catch(() => undefined);
		if (!(await context.queryClient.ensureQueryData(countryQuery(params.iso)))) notFound();
		return metadataLoaderData(metadataPromise);
	},
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	notFoundComponent: CountryNotFound,
	component: CountryPage,
});
