// Next: src/app/api/checkout/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/api/checkout/route";

export const Route = createFileRoute("/api/checkout/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
