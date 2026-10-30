// Next: src/app/api/checkout/create/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/api/checkout/create/route";

export const Route = createFileRoute("/api/checkout/create/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
