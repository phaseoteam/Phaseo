// Next: src/app/oauth/consent/submit/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/oauth/consent/submit/route";

export const Route = createFileRoute("/oauth/consent/submit/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
