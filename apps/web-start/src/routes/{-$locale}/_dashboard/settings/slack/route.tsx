// Next: src/app/[locale]/(dashboard)/settings/slack/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/settings/slack/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/settings/slack")({
	component: nextLayoutComponent(Layout),
});
