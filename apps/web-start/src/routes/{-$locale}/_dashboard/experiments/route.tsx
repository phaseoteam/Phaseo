// Next: src/app/[locale]/(dashboard)/experiments/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/experiments/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/experiments")({
	component: nextLayoutComponent(Layout),
});
