// Next: src/app/.well-known/oauth-authorization-server/api/auth/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/.well-known/oauth-authorization-server/api/auth/route";

export const Route = createFileRoute("/.well-known/oauth-authorization-server/api/auth/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
