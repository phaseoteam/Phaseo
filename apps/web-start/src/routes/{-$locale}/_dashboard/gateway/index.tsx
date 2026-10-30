// Next: src/app/[locale]/(dashboard)/gateway/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextPageComponent, withLoading } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/gateway/page";
import Loading from "@/app/[locale]/(dashboard)/gateway/loading";


export const Route = createFileRoute("/{-$locale}/_dashboard/gateway/")({
	component: withLoading(nextPageComponent(Page), Loading),
});
