// Next: src/app/[locale]/(dashboard)/internal/data/models/edit/[...modelId]/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/internal/data/models/edit/[...modelId]/page";


export const Route = createFileRoute("/{-$locale}/_dashboard/internal/data/models/edit/$")({
	component: nextPageComponent(Page, { splatName: "modelId" }),
});
