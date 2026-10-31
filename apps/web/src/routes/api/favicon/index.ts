import { createFileRoute } from "@tanstack/react-router";
import { faviconResponse } from "@/lib/favicon";

export const Route = createFileRoute("/api/favicon/")({
	server: { handlers: { GET: ({ request }) => faviconResponse(request) } },
});
