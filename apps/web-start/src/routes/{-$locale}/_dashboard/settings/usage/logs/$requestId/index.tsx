// Next: src/app/[locale]/(dashboard)/settings/usage/logs/[requestId]/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/settings/usage/logs/[requestId]/page";


export const Route = createFileRoute("/{-$locale}/_dashboard/settings/usage/logs/$requestId/")({
	component: nextPageComponent(Page),
});
