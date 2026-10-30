// Next: src/app/og/profile-share/[card]/route.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/og/profile-share/[card]/route";

export const Route = createFileRoute("/og/profile-share/$card/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
