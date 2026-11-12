import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { createAdminClient } from "../apps/web/src/utils/supabase/admin";
import { decodePublicData, publicDataManifest } from "./artificial-analysis/public-page";
import { PROGRESS_INDEX_ID, PROGRESS_INDEX_URL, progressIndexRows, staleProgressResultIds } from "./artificial-analysis/progress-index";

for (const file of ["apps/web/.env.local", ".env.local", ".env"]) {
	if (existsSync(resolve(file))) loadEnvFile(resolve(file));
}

function stableUuid(value: string) {
	const hash = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
	hash[12] = "4";
	hash[16] = ((Number.parseInt(hash[16], 16) & 0x3) | 0x8).toString(16);
	const string = hash.join("");
	return `${string.slice(0, 8)}-${string.slice(8, 12)}-${string.slice(12, 16)}-${string.slice(16, 20)}-${string.slice(20)}`;
}

async function fetchSource(url: string) {
	const response = await fetch(url, { headers: { "user-agent": "Phaseo benchmark sync (https://phaseo.app)" } });
	if (!response.ok) throw new Error(`${url} returned ${response.status}`);
	return response;
}

async function main() {
	const html = await (await fetchSource(PROGRESS_INDEX_URL)).text();
	const manifest = publicDataManifest(html);
	const models = decodePublicData(Buffer.from(await (await fetchSource(new URL(manifest.path, PROGRESS_INDEX_URL).href)).arrayBuffer()), manifest.key);

	// Reuse the reviewed configuration ownership from the latest published dashboard snapshot.
	const db = createAdminClient();
	const { data: snapshot, error: snapshotError } = await db.from("artificial_analysis_public_snapshots")
		.select("snapshot_id,payload").order("fetched_at", { ascending: false }).limit(1).maybeSingle();
	if (snapshotError) throw snapshotError;
	const payload = snapshot?.payload as { models?: Array<{ id: string; effort?: string | null }>; matching?: { sources?: Array<{ id: string; model_id: string | null }> } } | undefined;
	const owners = new Map((payload?.matching?.sources ?? []).flatMap((source) => source.model_id ? [[source.id, source.model_id] as const] : []));
	if (!owners.size) throw new Error("Latest AA dashboard snapshot has no configuration ownership; publish it first.");
	const variants = new Map((payload?.models ?? []).map((model) => [model.id, model.effort ?? null]));

	const { rows, scored } = progressIndexRows(models, owners, variants);
	console.log(`AA Progress Index v1: ${scored} scored configurations, ${rows.length} matched to ${new Set(rows.map((row) => row.modelSlug)).size} models (ownership from snapshot ${snapshot!.snapshot_id}).`);
	if (!rows.length) throw new Error("No Progress Index configurations matched; nothing written.");
	if (!process.argv.includes("--write")) { console.log("Dry run complete. Use --write to update the database catalog."); return; }

	const updatedAt = new Date().toISOString();
	const results = rows.map((row, index) => {
		const resultKey = `${row.modelSlug}:${PROGRESS_INDEX_ID}:${row.sourceId}`;
		return { result_id: stableUuid(`benchmark-result:${resultKey}`), model_slug: row.modelSlug, benchmark_id: PROGRESS_INDEX_ID, score: String(Math.round(row.score * 10) / 10), score_numeric: Math.round(row.score * 10) / 10, is_self_reported: false, other_info: `${row.name}; Artificial Analysis ID ${row.sourceId}; Progress Index v1`, source_link: PROGRESS_INDEX_URL, rank: index + 1, occur_idx: index, variant: row.variant, result_key: resultKey, effective_to: null, updated_at: updatedAt };
	});
	const { data: active, error: activeError } = await db.from("v2_benchmark_results").select("result_id").eq("benchmark_id", PROGRESS_INDEX_ID).is("effective_to", null);
	if (activeError) throw activeError;
	const stale = staleProgressResultIds((active ?? []).map((row) => row.result_id), results.map((row) => row.result_id));

	const { error: benchmarkError } = await db.from("v2_benchmarks").upsert({ benchmark_id: PROGRESS_INDEX_ID, name: "Artificial Analysis Progress Index v1", category: "general", ascending_order: true, benchmark_type: "numerical", link: PROGRESS_INDEX_URL, total_models: new Set(rows.map((row) => row.modelSlug)).size, updated_at: updatedAt }, { onConflict: "benchmark_id" });
	if (benchmarkError) throw benchmarkError;
	for (let index = 0; index < results.length; index += 250) {
		const { error } = await db.from("v2_benchmark_results").upsert(results.slice(index, index + 250), { onConflict: "result_id" });
		if (error) throw error;
	}
	if (stale.length) {
		const { error } = await db.from("v2_benchmark_results").update({ effective_to: updatedAt, updated_at: updatedAt }).is("effective_to", null).in("result_id", stale);
		if (error) throw error;
	}
	console.log(`Synchronized ${results.length} Progress Index results; retired ${stale.length}. Public caches expire under their normal TTLs.`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
