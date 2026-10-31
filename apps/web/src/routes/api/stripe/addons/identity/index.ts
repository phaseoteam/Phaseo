// Next: src/app/api/stripe/addons/identity/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/api/stripe/addons/identity/route";

export const Route = createFileRoute("/api/stripe/addons/identity/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
