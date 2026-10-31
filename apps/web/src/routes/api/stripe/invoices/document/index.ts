// Next: src/app/api/stripe/invoices/document/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/api/stripe/invoices/document/route";

export const Route = createFileRoute("/api/stripe/invoices/document/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
