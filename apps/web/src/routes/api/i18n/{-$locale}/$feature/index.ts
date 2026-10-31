// Next: src/app/api/i18n/[locale]/[feature]/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/api/i18n/[locale]/[feature]/route";

export const Route = createFileRoute("/api/i18n/{-$locale}/$feature/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
