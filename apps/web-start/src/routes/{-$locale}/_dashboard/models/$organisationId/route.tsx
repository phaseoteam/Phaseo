// Next: src/app/[locale]/(dashboard)/models/[organisationId]/template.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/models/[organisationId]/template";


export const Route = createFileRoute("/{-$locale}/_dashboard/models/$organisationId")({
	component: nextLayoutComponent(Layout),
});
