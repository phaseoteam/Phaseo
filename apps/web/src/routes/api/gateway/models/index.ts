import { createFileRoute } from "@tanstack/react-router";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";

export const Route = createFileRoute("/api/gateway/models/")({
	server: {
		handlers: {
			GET: async () => {
				try {
					const models = await fetchFrontendGatewayModels();
					return Response.json({ models }, {
						headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" },
					});
				} catch {
					return Response.json({ error: "gateway_models_unavailable" }, { status: 503 });
				}
			},
		},
	},
});
