// Next: src/app/api/webhooks/stripe-checkout/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/api/webhooks/stripe-checkout/route";

export const Route = createFileRoute("/api/webhooks/stripe-checkout/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
