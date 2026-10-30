// Next: src/app/api/stripe/addons/identity/quote/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/api/stripe/addons/identity/quote/route";

export const Route = createFileRoute("/api/stripe/addons/identity/quote/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
