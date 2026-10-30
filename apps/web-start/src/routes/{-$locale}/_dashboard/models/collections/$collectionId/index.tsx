// Next: src/app/[locale]/(dashboard)/models/collections/[collectionId]/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/models/collections/[collectionId]/page";


export const Route = createFileRoute("/{-$locale}/_dashboard/models/collections/$collectionId/")({
	component: nextPageComponent(Page),
});
