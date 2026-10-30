// Next: src/app/[locale]/(dashboard)/gateway/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/gateway/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/gateway")({
	component: nextLayoutComponent(Layout),
});
