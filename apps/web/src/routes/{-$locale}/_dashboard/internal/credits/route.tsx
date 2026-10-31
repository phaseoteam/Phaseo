// Next: src/app/[locale]/(dashboard)/internal/credits/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/internal/credits/layout";
import { requireInternalAdminFn } from "@/app/[locale]/(dashboard)/internal/internalAdmin.functions";


export const Route = createFileRoute("/{-$locale}/_dashboard/internal/credits")({
	// Next: requireInternalAdmin("/internal") in the layout. Runs before anything renders.
	beforeLoad: async () => {
		await requireInternalAdminFn({ data: "/internal" });
	},
	component: nextLayoutComponent(Layout),
});
