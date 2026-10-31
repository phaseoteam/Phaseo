// Next: src/app/[locale]/(dashboard)/settings/workspaces/page.tsx (a redirect-only page).
import { createFileRoute } from "@tanstack/react-router";
import { redirectBeforeLoad } from "@/lib/start/redirectRoute";

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/workspaces/")({
	beforeLoad: redirectBeforeLoad("temporary", () => "/settings/workspaces/settings"),
});
