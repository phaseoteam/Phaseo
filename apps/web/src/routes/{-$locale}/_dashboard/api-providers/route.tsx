// Next: src/app/[locale]/(dashboard)/api-providers/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/api-providers/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/api-providers")({
	component: nextLayoutComponent(Layout),
});
