import { createFileRoute } from "@tanstack/react-router";
import { buildOAuthProtectedResourceMetadata } from "@/lib/agent-discovery";

export const Route = createFileRoute("/.well-known/oauth-protected-resource/")({
	server: {
		handlers: {
			GET: () =>
				Response.json(buildOAuthProtectedResourceMetadata(), {
					headers: {
						"Cache-Control": "public, max-age=3600, stale-while-revalidate=3600",
					},
				}),
		},
	},
});
