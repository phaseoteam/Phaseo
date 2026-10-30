// Next: src/app/[locale]/(dashboard)/settings/provisioning-keys/page.tsx (a redirect-only page).
import { createFileRoute } from "@tanstack/react-router";
import { redirectBeforeLoad } from "@/lib/start/redirectRoute";

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/provisioning-keys/")({
	beforeLoad: redirectBeforeLoad("permanent", () => "/settings/management-api-keys"),
});
