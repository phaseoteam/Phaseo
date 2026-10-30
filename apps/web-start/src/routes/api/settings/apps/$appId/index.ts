// Next: src/app/api/settings/apps/[appId]/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/api/settings/apps/[appId]/route";

export const Route = createFileRoute("/api/settings/apps/$appId/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
