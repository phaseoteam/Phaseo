// Next: src/app/[locale]/(dashboard)/contact/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/contact/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/contact")({
	component: nextLayoutComponent(Layout),
});
