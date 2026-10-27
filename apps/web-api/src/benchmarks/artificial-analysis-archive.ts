import type { getDataClient } from "@/data/supabase";

// Immutable publications captured before the v5 transition on 27 October 2026.
// These are references to database-owned records, not copies of catalogue data.
export const AA_V4_ARCHIVE = {
	version: "4.3.2",
	core: "f2fbb596-387c-4a2c-92f4-1b59dd723683",
	public: "b72700f9-a724-4089-9794-c698f9a4efd9",
} as const;

type Client = ReturnType<typeof getDataClient>;
type ArchivedResult = {
	result_id: string; model_slug: string; benchmark_id: string; score: string;
	is_self_reported: boolean; other_info: string | null; source_link: string | null;
	created_at: string | null; updated_at: string | null; rank: number | null;
	variant: string | null; result_key: string | null;
};
export async function archivedArtificialAnalysisResults(client: Client) {
	const { data, error } = await client.from("artificial_analysis_snapshots")
		.select("methodology_version,payload").eq("snapshot_id", AA_V4_ARCHIVE.core).maybeSingle();
	if (error) throw error;
	if (!data || data.methodology_version !== AA_V4_ARCHIVE.version || !Array.isArray(data.payload?.results)) throw new Error("AA v4 archive unavailable");
	return (data.payload.results as ArchivedResult[]).map((row) => ({ ...row, created_at: row.created_at ?? null }));
}

export async function archivedArtificialAnalysisPublicData(client: Client, selection: { model?: string; limit: number; offset: number }) {
	const { data, error } = await client.from("artificial_analysis_public_snapshots")
		.select("snapshot_id,methodology_version,fetched_at,payload").eq("snapshot_id", AA_V4_ARCHIVE.public).maybeSingle();
	if (error) throw error;
	if (!data || data.methodology_version !== AA_V4_ARCHIVE.version || !Array.isArray(data.payload?.models) || !Array.isArray(data.payload?.matching?.sources)) throw new Error("AA v4 public archive unavailable");
	const owners = new Map<string, string>(data.payload.matching.sources.filter((source: { model_id?: string }) => source.model_id).map((source: { id: string; model_id: string }) => [source.id, source.model_id]));
	const slugs = [...new Set(owners.values())].filter((slug) => !selection.model || slug === selection.model);
	const visible = new Set<string>();
	for (let start = 0; start < slugs.length; start += 200) {
		const result = await client.from("v2_models").select("model_slug,hidden").in("model_slug", slugs.slice(start, start + 200));
		if (result.error) throw result.error;
		for (const model of result.data ?? []) if (!model.hidden) visible.add(model.model_slug);
	}
	const models = data.payload.models.flatMap((model: { id: string; sourceData?: unknown }) => {
		const owner = owners.get(model.id);
		if (!owner || !visible.has(owner)) return [];
		const { sourceData: _privateSource, ...publicModel } = model;
		return [{ ...publicModel, model_id: owner }];
	}).sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id));
	return { snapshot_id: data.snapshot_id, methodology_version: data.methodology_version, fetched_at: data.fetched_at,
		source_url: data.payload.sourceUrl, total: models.length, models: models.slice(selection.offset, selection.offset + selection.limit) };
}
