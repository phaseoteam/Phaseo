import { createFileRoute } from "@tanstack/react-router";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi, WebApiError } from "@/lib/web-api/client";

async function handlePut(
	request: Request,
	params: { appId: string },
) {
	const { appId } = params;
	const account = await getServerAccountContext();
	if (!account.accessToken) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	try {
		const result = await fetchAccountWebApi<Record<string, unknown>>(
			`/api/account/settings/apps/${encodeURIComponent(appId)}`,
			account.accessToken,
			{ method: "PUT", body: await request.text() },
		);
		return Response.json(result);
	} catch (error) {
		if (error instanceof WebApiError) {
			return Response.json(
				{ error: error.detail ?? "app_update_failed" },
				{ status: error.status },
			);
		}
		return Response.json({ error: "app_update_failed" }, { status: 500 });
	}
}

export const Route = createFileRoute("/api/settings/apps/$appId/")({
	server: {
		handlers: {
			PUT: ({ request, params }) => handlePut(request, params),
		},
	},
});
