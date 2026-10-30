// Next: src/app/[locale]/(dashboard)/acknowledgements/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/acknowledgements/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/acknowledgements")({
	component: nextLayoutComponent(Layout),
});
