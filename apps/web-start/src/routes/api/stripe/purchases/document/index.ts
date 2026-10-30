// Next: src/app/api/stripe/purchases/document/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/api/stripe/purchases/document/route";

export const Route = createFileRoute("/api/stripe/purchases/document/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
