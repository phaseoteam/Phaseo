// Redirect-only: announcements moved to the blog.
import { createFileRoute } from "@tanstack/react-router";
import { redirectBeforeLoad, searchString } from "@/lib/start/redirectRoute";

export const Route = createFileRoute("/{-$locale}/_dashboard/announcements/")({
	beforeLoad: redirectBeforeLoad("permanent", ({ search }) => {
		const category = searchString(search, "category");
		return category === "announcements" || category === "guides" || category === "data" ? `/blog?category=${category}` : "/blog";
	}),
});
