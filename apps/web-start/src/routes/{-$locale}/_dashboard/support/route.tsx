// Next: src/app/[locale]/(dashboard)/support/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/support/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/support")({
	component: nextLayoutComponent(Layout),
});
