// Redirect-only: sends visitors to Phaseo on Instagram.
import { createFileRoute } from "@tanstack/react-router";
import { redirectBeforeLoad } from "@/lib/start/redirectRoute";

export const Route = createFileRoute("/{-$locale}/instagram/")({
	beforeLoad: redirectBeforeLoad("temporary", () => "https://instagram.com/ai__stats"),
});
