import { createFileRoute } from "@tanstack/react-router";
import { metadataToHead, notFoundMetadata } from "@/lib/start/metadataToHead";
import ModelLayout, { getModelLayoutMetadata } from "@/features/models/organisationId/modelId/ModelLayout";
import ModelNotFound from "@/features/models/organisationId/modelId/ModelNotFound";

export const Route = createFileRoute("/{-$locale}/_dashboard/models/$organisationId/$modelId")({
	head: ({ match }) => metadataToHead(notFoundMetadata(match) ?? getModelLayoutMetadata()),
	notFoundComponent: ModelNotFound,
	component: ModelLayout,
});
