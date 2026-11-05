import { createFileRoute } from "@tanstack/react-router";
import { metadataToHead } from "@/lib/start/metadataToHead";
import InternalLayout from "@/features/internal/InternalLayout";
import { getInternalLayoutMetadata } from "@/features/internal/internalLayoutMetadata";

export const Route = createFileRoute("/{-$locale}/_dashboard/internal")({
	head: () => metadataToHead(getInternalLayoutMetadata()),
	component: InternalLayout,
});
