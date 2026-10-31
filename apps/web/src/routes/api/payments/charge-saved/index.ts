// Next: src/app/api/payments/charge-saved/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/api/payments/charge-saved/route";

export const Route = createFileRoute("/api/payments/charge-saved/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
