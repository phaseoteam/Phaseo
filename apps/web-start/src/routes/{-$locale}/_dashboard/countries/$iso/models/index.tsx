// Next: src/app/[locale]/(dashboard)/countries/[iso]/models/page.tsx (a redirect-only page).
import { createFileRoute } from "@tanstack/react-router";
import { redirectBeforeLoad } from "@/lib/start/redirectRoute";

export const Route = createFileRoute("/{-$locale}/_dashboard/countries/$iso/models/")({
	beforeLoad: redirectBeforeLoad("temporary", ({ params }) => `/countries/${encodeURIComponent((params.iso ?? "").toLowerCase())}#models`),
});
