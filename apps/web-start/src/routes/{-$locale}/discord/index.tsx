// Next: src/app/[locale]/discord/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/discord/page";


export const Route = createFileRoute("/{-$locale}/discord/")({
	head: () => metadataToHead((mod as { metadata?: Record<string, unknown> }).metadata),
	component: nextPageComponent(Page),
});
