// Next: src/app/[locale]/(dashboard)/announcements/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/announcements/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/announcements")({
	component: nextLayoutComponent(Layout),
});
