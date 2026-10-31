import { createFileRoute } from "@tanstack/react-router";
import { buildOpenIdConfiguration } from "@/lib/agent-discovery";

export const Route = createFileRoute("/.well-known/openid-configuration/")({
	server: {
		handlers: {
			GET: () =>
				Response.json(buildOpenIdConfiguration(), {
					headers: {
						"Cache-Control": "public, max-age=3600, stale-while-revalidate=3600",
					},
				}),
		},
	},
});
