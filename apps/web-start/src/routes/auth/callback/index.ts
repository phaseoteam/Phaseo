// Next: src/app/auth/callback/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/auth/callback/route";

export const Route = createFileRoute("/auth/callback/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
