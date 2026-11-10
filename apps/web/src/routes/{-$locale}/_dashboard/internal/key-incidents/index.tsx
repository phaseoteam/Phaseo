import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import KeyIncidentsPage, { getKeyIncidentsMetadata } from "@/features/internal/key-incidents/KeyIncidentsPage";
import { requireInternalAdminFn } from "@/features/internal/internalAdmin.functions";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getKeyIncidentsMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/internal/key-incidents/")({
	// Internal admins only (requireInternalAdmin), checked before anything renders.
	beforeLoad: async () => {
		await requireInternalAdminFn({ data: "/" });
	},
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: KeyIncidentsPage,
});
