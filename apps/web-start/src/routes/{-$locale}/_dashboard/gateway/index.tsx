// Next: src/app/[locale]/(dashboard)/gateway/page.tsx (a redirect-only page).
import { createFileRoute } from "@tanstack/react-router";
import { redirectBeforeLoad } from "@/lib/start/redirectRoute";

export const Route = createFileRoute("/{-$locale}/_dashboard/gateway/")({
	beforeLoad: redirectBeforeLoad("permanent", () => "/"),
});
