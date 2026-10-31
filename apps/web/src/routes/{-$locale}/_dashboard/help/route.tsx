// Next: src/app/[locale]/(dashboard)/help/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/help/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/help")({
	component: nextLayoutComponent(Layout),
});
