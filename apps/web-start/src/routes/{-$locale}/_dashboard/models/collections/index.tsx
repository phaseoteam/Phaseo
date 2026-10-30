// Next: src/app/[locale]/(dashboard)/models/collections/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextPageComponent, withLoading } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/models/collections/page";
import Loading from "@/app/[locale]/(dashboard)/models/collections/loading";


export const Route = createFileRoute("/{-$locale}/_dashboard/models/collections/")({
	component: withLoading(nextPageComponent(Page), Loading),
});
