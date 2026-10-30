// Next: src/app/[locale]/(dashboard)/chat/audio/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/chat/audio/page";


export const Route = createFileRoute("/{-$locale}/_dashboard/chat/audio/")({
	component: nextPageComponent(Page),
});
