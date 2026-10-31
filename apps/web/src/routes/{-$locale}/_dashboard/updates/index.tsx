// Next: src/app/[locale]/(dashboard)/updates/page.tsx (a redirect-only page).
import { createFileRoute } from "@tanstack/react-router";
import { redirectBeforeLoad } from "@/lib/start/redirectRoute";

export const Route = createFileRoute("/{-$locale}/_dashboard/updates/")({
	beforeLoad: redirectBeforeLoad("temporary", () => "/updates/models"),
});
