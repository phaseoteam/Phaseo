// Next: src/app/[locale]/(dashboard)/settings/account/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/settings/account/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/settings/account")({
	component: nextLayoutComponent(Layout),
});
