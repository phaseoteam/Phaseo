// Next: src/app/[locale]/(dashboard)/api-providers/[apiProvider]/models/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/api-providers/[apiProvider]/models/page";


export const Route = createFileRoute("/{-$locale}/_dashboard/api-providers/$apiProvider/models/")({
	component: nextPageComponent(Page),
});
