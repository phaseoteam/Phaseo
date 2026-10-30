// Next: src/app/api/webhooks/resend/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/api/webhooks/resend/route";

export const Route = createFileRoute("/api/webhooks/resend/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
