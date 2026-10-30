// Next: src/app/[locale]/(dashboard)/updates/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/updates/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/updates")({
	component: nextLayoutComponent(Layout),
});
