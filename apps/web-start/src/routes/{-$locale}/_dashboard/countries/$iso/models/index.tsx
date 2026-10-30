// Next: src/app/[locale]/(dashboard)/countries/[iso]/models/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/countries/[iso]/models/page";


export const Route = createFileRoute("/{-$locale}/_dashboard/countries/$iso/models/")({
	component: nextPageComponent(Page),
});
