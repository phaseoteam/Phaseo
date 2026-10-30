// Next: src/app/__markdown/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/__markdown/route";

export const Route = createFileRoute("/__markdown/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
