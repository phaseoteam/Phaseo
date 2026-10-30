// Next: src/app/[locale]/(dashboard)/games/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/games/page";


export const Route = createFileRoute("/{-$locale}/_dashboard/games/")({
	component: nextPageComponent(Page),
});
