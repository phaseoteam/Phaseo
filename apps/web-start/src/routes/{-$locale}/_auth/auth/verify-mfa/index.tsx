// Next: src/app/[locale]/(auth)/auth/verify-mfa/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(auth)/auth/verify-mfa/page";


export const Route = createFileRoute("/{-$locale}/_auth/auth/verify-mfa/")({
	component: nextPageComponent(Page),
});
