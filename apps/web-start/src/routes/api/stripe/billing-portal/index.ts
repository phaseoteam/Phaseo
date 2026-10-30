// Next: src/app/api/stripe/billing-portal/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/api/stripe/billing-portal/route";

export const Route = createFileRoute("/api/stripe/billing-portal/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
