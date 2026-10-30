// Next: src/app/[locale]/(dashboard)/internal/cache/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/internal/cache/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/internal/cache")({
	component: nextLayoutComponent(Layout),
});
