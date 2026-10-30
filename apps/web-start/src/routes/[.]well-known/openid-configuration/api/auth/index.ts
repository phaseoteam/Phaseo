// Next: src/app/.well-known/openid-configuration/api/auth/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/.well-known/openid-configuration/api/auth/route";

export const Route = createFileRoute("/.well-known/openid-configuration/api/auth/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
