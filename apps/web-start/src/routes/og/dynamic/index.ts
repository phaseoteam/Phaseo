// Next: src/app/og/dynamic/route.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/og/dynamic/route";

export const Route = createFileRoute("/og/dynamic/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
