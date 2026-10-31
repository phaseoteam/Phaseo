// Next: src/app/[locale]/(dashboard)/tools/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/tools/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/tools")({
	component: nextLayoutComponent(Layout),
});
