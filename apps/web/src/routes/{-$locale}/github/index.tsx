// Redirect-only: sends visitors to Phaseo on GitHub.
import { createFileRoute } from "@tanstack/react-router";
import { redirectBeforeLoad } from "@/lib/start/redirectRoute";

export const Route = createFileRoute("/{-$locale}/github/")({
	beforeLoad: redirectBeforeLoad("temporary", () => "https://github.com/phaseoteam/Phaseo"),
});
