import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { routeMetadataInput, type RouteMetadataInput, toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import LocalisationPreviewLocalePage, { getLocalisationPreviewLocaleMetadata } from "@/features/internal/localisation-preview/previewLocale/LocalisationPreviewLocalePage";
import { requireInternalAdminFn } from "@/features/internal/internalAdmin.functions";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: RouteMetadataInput) => input)
	.handler(async ({ data }) => toSerializableMetadata(await getLocalisationPreviewLocaleMetadata(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/internal/localisation-preview/$previewLocale/")({
	// Internal admins only (requireInternalAdmin("/internal")), checked before anything renders.
	beforeLoad: async () => {
		await requireInternalAdminFn({ data: "/internal" });
	},
	loader: ({ params, location }) => metadataLoaderData(routeMetadata({ data: routeMetadataInput(params, location.search) })),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: LocalisationPreviewLocalePage,
});
