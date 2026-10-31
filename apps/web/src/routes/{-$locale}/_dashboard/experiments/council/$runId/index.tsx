// Next: src/app/[locale]/(dashboard)/experiments/council/[runId]/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/experiments/council/[runId]/page";


export const Route = createFileRoute("/{-$locale}/_dashboard/experiments/council/$runId/")({
	component: nextPageComponent(Page),
});
