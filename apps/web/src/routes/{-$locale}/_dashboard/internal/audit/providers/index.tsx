import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import ProviderAuditPage, { getProviderAuditMetadata } from "@/features/internal/audit/providers/ProviderAuditPage";
import { requireInternalAdminFn } from "@/features/internal/internalAdmin.functions";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getProviderAuditMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/internal/audit/providers/")({
	// Internal admins only (requireInternalAdmin("/internal")), checked before anything renders.
	beforeLoad: async () => {
		await requireInternalAdminFn({ data: "/internal" });
	},
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: ProviderAuditPage,
});
