// Next: src/app/[locale]/(dashboard)/blog/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/blog/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/blog")({
	component: nextLayoutComponent(Layout),
});
