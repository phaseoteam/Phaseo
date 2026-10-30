// Next: src/app/[locale]/github/page.tsx (a redirect-only page).
import { createFileRoute } from "@tanstack/react-router";
import { redirectBeforeLoad } from "@/lib/start/redirectRoute";

export const Route = createFileRoute("/{-$locale}/github/")({
	beforeLoad: redirectBeforeLoad("temporary", () => "https://github.com/phaseoteam/Phaseo"),
});
