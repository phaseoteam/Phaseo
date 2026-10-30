// Next: src/app/[locale]/experiments/openui/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/experiments/openui/page";


export const Route = createFileRoute("/{-$locale}/experiments/openui/")({
	head: () => metadataToHead((mod as { metadata?: Record<string, unknown> }).metadata),
	component: nextPageComponent(Page),
});
