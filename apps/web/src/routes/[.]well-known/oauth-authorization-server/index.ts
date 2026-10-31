// Next: src/app/.well-known/oauth-authorization-server/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/.well-known/oauth-authorization-server/route";

export const Route = createFileRoute("/.well-known/oauth-authorization-server/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
