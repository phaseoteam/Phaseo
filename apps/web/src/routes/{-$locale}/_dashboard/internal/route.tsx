import { createFileRoute } from "@tanstack/react-router";
import { metadataToHead } from "@/lib/start/metadataToHead";
import InternalLayout, { getInternalLayoutMetadata } from "@/features/internal/InternalLayout";

export const Route = createFileRoute("/{-$locale}/_dashboard/internal")({
	head: () => metadataToHead(getInternalLayoutMetadata()),
	component: InternalLayout,
});
