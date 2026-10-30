// Next: src/app/[locale]/(dashboard)/models/[organisationId]/[modelId]/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { metadataToHead, notFoundMetadata } from "@/lib/start/metadataToHead";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/models/[organisationId]/[modelId]/layout";
import NotFound from "@/app/[locale]/(dashboard)/models/[organisationId]/[modelId]/not-found";


export const Route = createFileRoute("/{-$locale}/_dashboard/models/$organisationId/$modelId")({
	head: ({ match }) => metadataToHead(notFoundMetadata(match) ?? (mod as { metadata?: Record<string, unknown> }).metadata),
	notFoundComponent: NotFound,
	component: nextLayoutComponent(Layout),
});
