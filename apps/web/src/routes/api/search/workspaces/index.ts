import { createFileRoute } from "@tanstack/react-router";

import { fetchInternalAuthHeaderData } from "@/lib/fetchers/internal/fetchInternalAuthHeaderData";

async function handleGet() {
	try {
		const data = await fetchInternalAuthHeaderData();
		const workspaces = data.isLoggedIn
			? data.teams.map(({ id, name }) => ({ id, name }))
			: [];

		return Response.json(
			{ workspaces },
			{ headers: { "Cache-Control": "private, no-store" } },
		);
	} catch {
		return Response.json(
			{ workspaces: [] },
			{ headers: { "Cache-Control": "private, no-store" } },
		);
	}
}

export const Route = createFileRoute("/api/search/workspaces/")({
	server: {
		handlers: {
			GET: () => handleGet(),
		},
	},
});
