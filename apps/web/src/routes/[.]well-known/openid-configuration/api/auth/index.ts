import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/.well-known/openid-configuration/api/auth/")({
	server: {
		handlers: {
			GET: () =>
				Response.json(
					{
						error: "not_configured",
						message:
							"OpenID provider metadata is not configured in this deployment yet.",
					},
					{ status: 501 },
				),
		},
	},
});
