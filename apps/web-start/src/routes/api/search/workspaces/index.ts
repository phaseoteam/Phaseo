// Next: src/app/api/search/workspaces/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/api/search/workspaces/route";

export const Route = createFileRoute("/api/search/workspaces/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
