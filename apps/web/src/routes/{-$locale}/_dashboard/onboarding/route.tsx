// Next: src/app/[locale]/(dashboard)/onboarding/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/onboarding/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/onboarding")({
	component: nextLayoutComponent(Layout),
});
