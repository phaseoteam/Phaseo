// Next: src/app/[locale]/(auth)/auth/reset-password/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(auth)/auth/reset-password/page";


export const Route = createFileRoute("/{-$locale}/_auth/auth/reset-password/")({
	component: nextPageComponent(Page),
});
