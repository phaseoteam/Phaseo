import { createFileRoute } from "@tanstack/react-router";
import { buildMcpServerCard } from "@/lib/agent-discovery";

export const Route = createFileRoute("/.well-known/mcp/server-card.json/")({
	server: {
		handlers: {
			GET: () =>
				Response.json(buildMcpServerCard(), {
					headers: {
						"Cache-Control": "public, max-age=3600, stale-while-revalidate=3600",
					},
				}),
		},
	},
});
