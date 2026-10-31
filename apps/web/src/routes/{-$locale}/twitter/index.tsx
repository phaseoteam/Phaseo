// Next: src/app/[locale]/twitter/page.tsx (a redirect-only page).
import { createFileRoute } from "@tanstack/react-router";
import { redirectBeforeLoad } from "@/lib/start/redirectRoute";

export const Route = createFileRoute("/{-$locale}/twitter/")({
	beforeLoad: redirectBeforeLoad("temporary", () => "https://x.com/phaseoteam"),
});
