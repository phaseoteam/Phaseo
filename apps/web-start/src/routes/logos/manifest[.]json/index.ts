// Next: src/app/logos/manifest.json/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/logos/manifest.json/route";

export const Route = createFileRoute("/logos/manifest.json/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
