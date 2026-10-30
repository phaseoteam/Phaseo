// Next: src/app/[locale]/(dashboard)/families/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/families/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/families")({
	component: nextLayoutComponent(Layout),
});
