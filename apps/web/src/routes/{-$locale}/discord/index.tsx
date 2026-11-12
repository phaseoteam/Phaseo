// Redirect-only: sends visitors to Phaseo on Discord.
import { createFileRoute } from "@tanstack/react-router";
import { redirectBeforeLoad } from "@/lib/start/redirectRoute";

export const Route = createFileRoute("/{-$locale}/discord/")({
	beforeLoad: redirectBeforeLoad("temporary", () => "https://discord.gg/aQyywCvgZ5"),
});
