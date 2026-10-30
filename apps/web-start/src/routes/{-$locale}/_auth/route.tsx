// Next: src/app/[locale]/(auth)/layout.tsx
import { createFileRoute } from "@tanstack/react-router";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { nextLayoutComponent } from "@/lib/start/nextPage";
import Layout, * as mod from "@/app/[locale]/(auth)/layout";


export const Route = createFileRoute("/{-$locale}/_auth")({
	head: () => metadataToHead((mod as { metadata?: Record<string, unknown> }).metadata),
	component: nextLayoutComponent(Layout),
});
