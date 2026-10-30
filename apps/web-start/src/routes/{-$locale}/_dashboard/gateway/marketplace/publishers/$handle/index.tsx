// Next: src/app/[locale]/(dashboard)/gateway/marketplace/publishers/[handle]/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/gateway/marketplace/publishers/[handle]/page";


export const Route = createFileRoute("/{-$locale}/_dashboard/gateway/marketplace/publishers/$handle/")({
	component: nextPageComponent(Page),
});
