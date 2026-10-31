// Next: src/app/api/stripe/refunds/request/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/api/stripe/refunds/request/route";

export const Route = createFileRoute("/api/stripe/refunds/request/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
