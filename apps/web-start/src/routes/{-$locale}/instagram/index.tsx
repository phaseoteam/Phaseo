// Next: src/app/[locale]/instagram/page.tsx (a redirect-only page).
import { createFileRoute } from "@tanstack/react-router";
import { redirectBeforeLoad } from "@/lib/start/redirectRoute";

export const Route = createFileRoute("/{-$locale}/instagram/")({
	beforeLoad: redirectBeforeLoad("temporary", () => "https://instagram.com/ai__stats"),
});
