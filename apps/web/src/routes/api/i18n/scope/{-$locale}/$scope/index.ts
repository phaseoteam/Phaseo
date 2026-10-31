// Next: src/app/api/i18n/scope/[locale]/[scope]/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/api/i18n/scope/[locale]/[scope]/route";

export const Route = createFileRoute("/api/i18n/scope/{-$locale}/$scope/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
