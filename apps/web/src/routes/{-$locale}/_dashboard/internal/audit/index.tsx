import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import AuditPage, { getAuditMetadata } from "@/features/internal/audit/AuditPage";
import { requireInternalAdminFn } from "@/features/internal/internalAdmin.functions";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getAuditMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/internal/audit/")({
	// Internal admins only (requireInternalAdmin("/internal")), checked before anything renders.
	beforeLoad: async () => {
		await requireInternalAdminFn({ data: "/internal" });
	},
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: AuditPage,
});
