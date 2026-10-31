// Next: src/app/[locale]/(dashboard)/settings/tiers/page.tsx (a redirect-only page).
import { createFileRoute } from "@tanstack/react-router";
import { redirectBeforeLoad } from "@/lib/start/redirectRoute";

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/tiers/")({
	beforeLoad: redirectBeforeLoad("temporary", () => "/settings/credits"),
});
