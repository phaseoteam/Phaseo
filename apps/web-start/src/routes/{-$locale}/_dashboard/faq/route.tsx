// Next: src/app/[locale]/(dashboard)/faq/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/faq/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/faq")({
	component: nextLayoutComponent(Layout),
});
