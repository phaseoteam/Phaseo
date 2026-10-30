// Next: src/app/api/credits/topups/[id]/decline/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/api/credits/topups/[id]/decline/route";

export const Route = createFileRoute("/api/credits/topups/$id/decline/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
