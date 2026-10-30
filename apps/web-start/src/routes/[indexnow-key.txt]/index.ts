// Next: src/app/indexnow-key.txt/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/indexnow-key.txt/route";

export const Route = createFileRoute("/[indexnow-key/txt]/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
