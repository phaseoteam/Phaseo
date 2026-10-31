// Next: src/app/api/favicon/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/api/favicon/route";

export const Route = createFileRoute("/api/favicon/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
