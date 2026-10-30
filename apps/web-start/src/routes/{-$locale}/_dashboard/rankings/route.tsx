// Next: src/app/[locale]/(dashboard)/rankings/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/rankings/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/rankings")({
	component: nextLayoutComponent(Layout),
});
