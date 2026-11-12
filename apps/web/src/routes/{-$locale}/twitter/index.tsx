// Redirect-only: sends visitors to Phaseo on X.
import { createFileRoute } from "@tanstack/react-router";
import { redirectBeforeLoad } from "@/lib/start/redirectRoute";

export const Route = createFileRoute("/{-$locale}/twitter/")({
	beforeLoad: redirectBeforeLoad("temporary", () => "https://x.com/phaseoteam"),
});
