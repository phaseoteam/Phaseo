// Next: src/app/api/enterprise/directory/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/api/enterprise/directory/route";

export const Route = createFileRoute("/api/enterprise/directory/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
