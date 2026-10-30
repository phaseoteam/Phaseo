// Next: src/app/[locale]/(dashboard)/internal/credits/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/internal/credits/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/internal/credits")({
	component: nextLayoutComponent(Layout),
});
