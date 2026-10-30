// Next: src/app/[locale]/(dashboard)/models/table/template.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/models/table/template";


export const Route = createFileRoute("/{-$locale}/_dashboard/models/table")({
	component: nextLayoutComponent(Layout),
});
