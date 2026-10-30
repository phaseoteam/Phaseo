// Next: src/app/[locale]/(dashboard)/about/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/about/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/about")({
	component: nextLayoutComponent(Layout),
});
