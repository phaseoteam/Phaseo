// Next: src/app/.well-known/agent-skills/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/.well-known/agent-skills/route";

export const Route = createFileRoute("/.well-known/agent-skills/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
