// Next: src/app/[locale]/(dashboard)/announcements/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/announcements/page";


export const Route = createFileRoute("/{-$locale}/_dashboard/announcements/")({
	component: nextPageComponent(Page),
});
