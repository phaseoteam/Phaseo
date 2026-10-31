// Next: src/app/[locale]/(dashboard)/collections/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/collections/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/collections")({
	component: nextLayoutComponent(Layout),
});
