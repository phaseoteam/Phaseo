// Next: src/app/[locale]/(dashboard)/settings/teams/access/page.tsx (a redirect-only page).
import { createFileRoute } from "@tanstack/react-router";
import { redirectBeforeLoad } from "@/lib/start/redirectRoute";

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/teams/access/")({
	beforeLoad: redirectBeforeLoad("temporary", () => "/settings/workspaces/access"),
});
