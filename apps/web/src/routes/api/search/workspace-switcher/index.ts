import { createFileRoute } from "@tanstack/react-router";

import { fetchInternalAuthHeaderData } from "@/lib/fetchers/internal/fetchInternalAuthHeaderData";

const PAGE_SIZE = 50;

async function handleGet(request: Request) {
	const searchParams = new URL(request.url).searchParams;
	const query = String(searchParams.get("q") ?? "").trim().slice(0, 120);
	const offset = Math.min(1_000_000, Math.max(0, Math.floor(Number(searchParams.get("offset")) || 0)));
	if (query.length < 2) {
		return Response.json(
			{ workspaces: [], hasMore: false },
			{ headers: { "Cache-Control": "private, no-store" } },
		);
	}

	try {
		const data = await fetchInternalAuthHeaderData({ query, limit: PAGE_SIZE, offset });
		return Response.json(
			{ workspaces: data.teams, hasMore: Boolean(data.teamsHasMore) },
			{ headers: { "Cache-Control": "private, no-store" } },
		);
	} catch {
		return Response.json(
			{ error: "workspace_search_unavailable", workspaces: [], hasMore: false },
			{ status: 503, headers: { "Cache-Control": "private, no-store" } },
		);
	}
}

export const Route = createFileRoute("/api/search/workspace-switcher/")({
	server: {
		handlers: {
			GET: ({ request }) => handleGet(request),
		},
	},
});
