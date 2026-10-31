// Next: src/app/[locale]/(dashboard)/redeem/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/redeem/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/redeem")({
	component: nextLayoutComponent(Layout),
});
