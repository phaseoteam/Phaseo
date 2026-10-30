// Next: src/app/.well-known/mcp/server-card.json/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/.well-known/mcp/server-card.json/route";

export const Route = createFileRoute("/.well-known/mcp/server-card.json/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
