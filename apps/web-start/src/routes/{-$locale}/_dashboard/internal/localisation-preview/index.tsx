// Next: src/app/[locale]/(dashboard)/internal/localisation-preview/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/internal/localisation-preview/page";


export const Route = createFileRoute("/{-$locale}/_dashboard/internal/localisation-preview/")({
	component: nextPageComponent(Page),
});
