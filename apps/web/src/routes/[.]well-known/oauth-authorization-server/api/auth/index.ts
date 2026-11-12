import { createFileRoute } from "@tanstack/react-router";
import { buildOAuthAuthorizationServerMetadata } from "@/lib/agent-discovery";

export const Route = createFileRoute("/.well-known/oauth-authorization-server/api/auth/")({
	server: {
		handlers: {
			GET: () =>
				Response.json(buildOAuthAuthorizationServerMetadata(), {
					headers: {
						"Cache-Control": "public, max-age=3600, stale-while-revalidate=3600",
					},
				}),
		},
	},
});
