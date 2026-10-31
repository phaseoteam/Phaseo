// Next: src/app/[locale]/(dashboard)/announcements/page.tsx (a redirect-only page).
import { createFileRoute } from "@tanstack/react-router";
import { redirectBeforeLoad, searchString } from "@/lib/start/redirectRoute";

export const Route = createFileRoute("/{-$locale}/_dashboard/announcements/")({
	beforeLoad: redirectBeforeLoad("permanent", ({ search }) => {
		const category = searchString(search, "category");
		return category === "announcements" || category === "guides" || category === "data" ? `/blog?category=${category}` : "/blog";
	}),
});
