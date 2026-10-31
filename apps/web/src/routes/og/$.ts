// Next: src/app/og/[...slug]/route.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/og/[...slug]/route";

export const Route = createFileRoute("/og/$")({
	server: { handlers: nextRouteHandlers(handlers, { splatName: "slug" }) },
});
