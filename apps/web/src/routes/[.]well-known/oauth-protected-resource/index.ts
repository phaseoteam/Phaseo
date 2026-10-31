// Next: src/app/.well-known/oauth-protected-resource/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/.well-known/oauth-protected-resource/route";

export const Route = createFileRoute("/.well-known/oauth-protected-resource/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
