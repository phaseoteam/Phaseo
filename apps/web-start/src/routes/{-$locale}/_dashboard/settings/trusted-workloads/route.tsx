// Next: src/app/[locale]/(dashboard)/settings/trusted-workloads/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/settings/trusted-workloads/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/settings/trusted-workloads")({
	component: nextLayoutComponent(Layout),
});
