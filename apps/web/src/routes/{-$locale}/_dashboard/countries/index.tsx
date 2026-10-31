import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import CountriesPage, { getCountriesMetadata } from "@/features/countries/CountriesPage";
import CountriesLoading from "@/features/countries/CountriesLoading";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getCountriesMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/countries/")({
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	pendingComponent: CountriesLoading,
	component: CountriesPage,
});
