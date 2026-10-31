// Next: src/app/[locale]/(dashboard)/methodology/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/methodology/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/methodology")({
	component: nextLayoutComponent(Layout),
});
