// Next: src/app/api/gateway/models/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/api/gateway/models/route";

export const Route = createFileRoute("/api/gateway/models/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
