// Next: src/app/[locale]/(dashboard)/announcements/[slug]/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/announcements/[slug]/page";


export const Route = createFileRoute("/{-$locale}/_dashboard/announcements/$slug/")({
	component: nextPageComponent(Page),
});
