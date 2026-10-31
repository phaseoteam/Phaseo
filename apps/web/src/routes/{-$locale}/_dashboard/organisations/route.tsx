// Next: src/app/[locale]/(dashboard)/organisations/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/organisations/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/organisations")({
	component: nextLayoutComponent(Layout),
});
