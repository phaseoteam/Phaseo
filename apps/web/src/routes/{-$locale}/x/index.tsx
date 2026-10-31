// Next: src/app/[locale]/x/page.tsx (a redirect-only page).
import { createFileRoute } from "@tanstack/react-router";
import { redirectBeforeLoad } from "@/lib/start/redirectRoute";

export const Route = createFileRoute("/{-$locale}/x/")({
	beforeLoad: redirectBeforeLoad("temporary", () => "https://x.com/phaseoteam"),
});
