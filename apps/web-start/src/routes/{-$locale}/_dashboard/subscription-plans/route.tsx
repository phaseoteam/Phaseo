// Next: src/app/[locale]/(dashboard)/subscription-plans/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/subscription-plans/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/subscription-plans")({
	component: nextLayoutComponent(Layout),
});
