// Next: src/app/[locale]/(dashboard)/contribute/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/contribute/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/contribute")({
	component: nextLayoutComponent(Layout),
});
