// Next: src/app/api/credits/topups/[id]/confirm/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/api/credits/topups/[id]/confirm/route";

export const Route = createFileRoute("/api/credits/topups/$id/confirm/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
