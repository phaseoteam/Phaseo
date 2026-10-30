// Next: src/app/.well-known/phaseo-home.md/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/.well-known/phaseo-home.md/route";

export const Route = createFileRoute("/.well-known/[phaseo-home/md]/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
