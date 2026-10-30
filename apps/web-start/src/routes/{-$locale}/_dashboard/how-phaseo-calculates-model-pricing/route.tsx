// Next: src/app/[locale]/(dashboard)/how-phaseo-calculates-model-pricing/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/how-phaseo-calculates-model-pricing/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/how-phaseo-calculates-model-pricing")({
	component: nextLayoutComponent(Layout),
});
