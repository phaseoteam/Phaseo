// Next: src/app/[locale]/github/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/github/page";


export const Route = createFileRoute("/{-$locale}/github/")({
	head: () => metadataToHead((mod as { metadata?: Record<string, unknown> }).metadata),
	component: nextPageComponent(Page),
});
