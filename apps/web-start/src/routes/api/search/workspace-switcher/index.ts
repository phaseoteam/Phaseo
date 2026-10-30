// Next: src/app/api/search/workspace-switcher/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/api/search/workspace-switcher/route";

export const Route = createFileRoute("/api/search/workspace-switcher/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
