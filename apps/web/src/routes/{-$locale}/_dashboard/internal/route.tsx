// Next: src/app/[locale]/(dashboard)/internal/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(dashboard)/internal/layout";


export const Route = createFileRoute("/{-$locale}/_dashboard/internal")({
	head: () => metadataToHead((mod as { metadata?: Record<string, unknown> }).metadata),
	component: nextLayoutComponent(Layout),
});
