// Next: src/app/robots.txt/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/robots.txt/route";

export const Route = createFileRoute("/robots.txt/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
