// Next: src/app/[locale]/(dashboard)/how-phaseo-tracks-provider-availability/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/how-phaseo-tracks-provider-availability/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/how-phaseo-tracks-provider-availability")({
	component: nextLayoutComponent(Layout),
});
