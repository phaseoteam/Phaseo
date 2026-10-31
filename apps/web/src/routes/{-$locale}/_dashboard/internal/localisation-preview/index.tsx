// Next: src/app/[locale]/(dashboard)/internal/localisation-preview/page.tsx (a redirect-only page).
import { createFileRoute } from "@tanstack/react-router";
import { redirectBeforeLoad } from "@/lib/start/redirectRoute";
import { defaultLocale } from "@/i18n/locales";

export const Route = createFileRoute("/{-$locale}/_dashboard/internal/localisation-preview/")({
	beforeLoad: redirectBeforeLoad("temporary", () => `/internal/localisation-preview/${defaultLocale}`),
});
