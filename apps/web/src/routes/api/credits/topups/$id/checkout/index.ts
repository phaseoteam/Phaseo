// Next: src/app/api/credits/topups/[id]/checkout/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/api/credits/topups/[id]/checkout/route";

export const Route = createFileRoute("/api/credits/topups/$id/checkout/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
