// Redirect-only: sends visitors to Phaseo on Reddit.
import { createFileRoute } from "@tanstack/react-router";
import { redirectBeforeLoad } from "@/lib/start/redirectRoute";

export const Route = createFileRoute("/{-$locale}/reddit/")({
	beforeLoad: redirectBeforeLoad("temporary", () => "https://www.reddit.com/r/Phaseo/"),
});
