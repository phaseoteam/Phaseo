// Next: src/app/.well-known/api-catalog/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/.well-known/api-catalog/route";

export const Route = createFileRoute("/.well-known/api-catalog/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
