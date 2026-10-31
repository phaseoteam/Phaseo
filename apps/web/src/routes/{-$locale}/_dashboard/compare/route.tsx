// Next: src/app/[locale]/(dashboard)/compare/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/compare/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/compare")({
	component: nextLayoutComponent(Layout),
});
