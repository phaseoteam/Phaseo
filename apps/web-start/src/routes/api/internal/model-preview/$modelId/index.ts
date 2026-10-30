// Next: src/app/api/internal/model-preview/[modelId]/route.ts
import { createFileRoute } from "@tanstack/react-router";
import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";
import * as handlers from "@/app/api/internal/model-preview/[modelId]/route";

export const Route = createFileRoute("/api/internal/model-preview/$modelId/")({
	server: { handlers: nextRouteHandlers(handlers) },
});
