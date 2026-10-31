import { createFileRoute } from "@tanstack/react-router";
import { isAdminViewer } from "@/lib/auth/getViewerRole";
import { fetchAdminModelSource } from "@/lib/fetchers/internal/fetchAdminModelSource";
import { toAdminModelPreview } from "@/lib/models/adminModelPreview";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie" };

async function handleGet(_request: Request, params: { modelId: string }) {
	if (!(await isAdminViewer().catch(() => false))) {
		return new Response(null, { status: 404, headers: PRIVATE_HEADERS });
	}
	const { modelId } = params;
	const source = await fetchAdminModelSource(modelId).catch(() => null);
	const preview = source ? toAdminModelPreview(source) : null;
	if (!preview) return new Response(null, { status: 404, headers: PRIVATE_HEADERS });
	return Response.json(preview, { headers: PRIVATE_HEADERS });
}

export const Route = createFileRoute("/api/internal/model-preview/$modelId/")({
	server: {
		handlers: {
			GET: ({ request, params }) => handleGet(request, params),
		},
	},
});
