// Next: src/app/[locale]/(dashboard)/announcements/[slug]/page.tsx (a redirect-only page).
import { createFileRoute } from "@tanstack/react-router";
import { redirectBeforeLoad } from "@/lib/start/redirectRoute";

export const Route = createFileRoute("/{-$locale}/_dashboard/announcements/$slug/")({
	beforeLoad: redirectBeforeLoad("permanent", ({ params }) => `/blog/${params.slug}`),
});
