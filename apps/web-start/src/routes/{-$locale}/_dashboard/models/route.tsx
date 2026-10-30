// Next: src/app/[locale]/(dashboard)/models/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/models/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/models")({
	component: nextLayoutComponent(Layout),
});
