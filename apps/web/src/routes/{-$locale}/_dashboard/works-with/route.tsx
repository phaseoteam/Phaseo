// Next: src/app/[locale]/(dashboard)/works-with/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/works-with/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/works-with")({
	component: nextLayoutComponent(Layout),
});
