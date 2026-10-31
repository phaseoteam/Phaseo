// Next: src/app/[locale]/(dashboard)/performance/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/performance/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/performance")({
	component: nextLayoutComponent(Layout),
});
