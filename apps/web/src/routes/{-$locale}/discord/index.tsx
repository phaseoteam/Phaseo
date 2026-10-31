// Next: src/app/[locale]/discord/page.tsx (a redirect-only page).
import { createFileRoute } from "@tanstack/react-router";
import { redirectBeforeLoad } from "@/lib/start/redirectRoute";

export const Route = createFileRoute("/{-$locale}/discord/")({
	beforeLoad: redirectBeforeLoad("temporary", () => "https://discord.gg/aQyywCvgZ5"),
});
