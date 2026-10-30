// Next: src/app/[locale]/(dashboard)/internal/data/imports/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/internal/data/imports/page";


export const Route = createFileRoute("/{-$locale}/_dashboard/internal/data/imports/")({
	component: nextPageComponent(Page),
});
