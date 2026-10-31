// Redirect-only: announcements moved to the blog.
import { createFileRoute } from "@tanstack/react-router";
import { redirectBeforeLoad } from "@/lib/start/redirectRoute";

export const Route = createFileRoute("/{-$locale}/_dashboard/announcements/$slug/")({
	beforeLoad: redirectBeforeLoad("permanent", ({ params }) => `/blog/${params.slug}`),
});
