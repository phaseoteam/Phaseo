// Next: src/app/[locale]/(dashboard)/api-providers/[apiProvider]/image-models/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/api-providers/[apiProvider]/image-models/page";


export const Route = createFileRoute("/{-$locale}/_dashboard/api-providers/$apiProvider/image-models/")({
	head: () => metadataToHead((mod as { metadata?: Record<string, unknown> }).metadata),
	component: nextPageComponent(Page),
});
