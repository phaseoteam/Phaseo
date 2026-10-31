// Next: src/app/api/settings/provider-onboarding/previews/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/api/settings/provider-onboarding/previews/route";

export const Route = createFileRoute("/api/settings/provider-onboarding/previews/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
