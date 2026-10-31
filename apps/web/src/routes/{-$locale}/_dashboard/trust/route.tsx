// Next: src/app/[locale]/(dashboard)/trust/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/trust/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/trust")({
	component: nextLayoutComponent(Layout),
});
