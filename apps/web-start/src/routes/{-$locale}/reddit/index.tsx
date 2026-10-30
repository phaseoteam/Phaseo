// Next: src/app/[locale]/reddit/page.tsx (a redirect-only page).
import { createFileRoute } from "@tanstack/react-router";
import { redirectBeforeLoad } from "@/lib/start/redirectRoute";

export const Route = createFileRoute("/{-$locale}/reddit/")({
	beforeLoad: redirectBeforeLoad("temporary", () => "https://www.reddit.com/r/Phaseo/"),
});
