// Next: src/app/[locale]/(dashboard)/internal/data/benchmarks/new/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/internal/data/benchmarks/new/page";


export const Route = createFileRoute("/{-$locale}/_dashboard/internal/data/benchmarks/new/")({
	component: nextPageComponent(Page),
});
