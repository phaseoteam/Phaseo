"use server";

import { fetchAdminCatalogList } from "@/lib/fetchers/internal/fetchAdminCatalog";

export async function searchAdminModelsForDockAction(query: string) {
	const normalizedQuery = query.trim().replace(/[(),]/g, " ").slice(0, 120);
	if (normalizedQuery.length < 2) return [];

	const { rows } = await fetchAdminCatalogList("models", {
		q: normalizedQuery,
		page: 1,
		pageSize: 12,
	});

	return rows.flatMap((row: { model_id?: unknown; name?: unknown }) => {
		const modelId = typeof row.model_id === "string" ? row.model_id.trim() : "";
		if (!modelId) return [];
		return [{ modelId, name: typeof row.name === "string" && row.name.trim() ? row.name : modelId }];
	});
}
