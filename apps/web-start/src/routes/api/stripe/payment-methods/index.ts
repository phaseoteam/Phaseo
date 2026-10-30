// Next: src/app/api/stripe/payment-methods/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/api/stripe/payment-methods/route";

export const Route = createFileRoute("/api/stripe/payment-methods/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
