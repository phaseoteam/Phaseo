// Next: src/app/[locale]/(dashboard)/countries/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/countries/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/countries")({
	component: nextLayoutComponent(Layout),
});
