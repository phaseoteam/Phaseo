// Next: src/app/[locale]/(dashboard)/mission/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/mission/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/mission")({
	component: nextLayoutComponent(Layout),
});
