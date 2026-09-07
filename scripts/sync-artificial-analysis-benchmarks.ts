import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { createAdminClient } from "../apps/web/src/utils/supabase/admin";
import { METRICS, fetchModels, matchModel, mergeResults, metricValue, resultsFor, type CatalogModel, type MappingConfig } from "./artificial-analysis/core";

for (const file of ["apps/web/.env.local", ".env.local", ".env"]) {
	if (existsSync(resolve(file))) loadEnvFile(resolve(file));
}
const DATA_ROOT = resolve("packages/data/catalog/src/data");
function modelFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const file = join(directory, entry.name);
		return entry.isDirectory() ? modelFiles(file) : entry.name === "model.json" ? [file] : [];
	});
}
function writeJson(file: string, value: unknown) {
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
function stableUuid(value: string) {
	const hash = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
	hash[12] = "4";
	hash[16] = ((Number.parseInt(hash[16], 16) & 0x3) | 0x8).toString(16);
	const s = hash.join("");
	return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

async function main() {
	const apiKey = process.env.ARTIFICIAL_ANALYSIS_API_KEY?.trim();
	if (!apiKey) throw new Error("Set ARTIFICIAL_ANALYSIS_API_KEY in .env.local, .env, apps/web/.env.local or the environment.");
	const write = process.argv.includes("--write");
	const syncDb = process.argv.includes("--sync-db");
	const config = JSON.parse(readFileSync(resolve("scripts/artificial-analysis/mappings.json"), "utf8")) as MappingConfig;
	if (!config.models || !config.creators || Object.values(config.models).some((id) => id !== null && (typeof id !== "string" || !id)) || Object.values(config.creators).some((id) => typeof id !== "string" || !id)) throw new Error("Invalid Artificial Analysis mappings.");
	const entries: Array<{ file: string | null; model: CatalogModel }> = modelFiles(join(DATA_ROOT, "models")).map((file) => ({ file, model: JSON.parse(readFileSync(file, "utf8")) }));
	const db = syncDb ? createAdminClient() : null;
	const dbIds = new Set<string>();
	if (db) {
		for (let offset = 0; ; offset += 500) {
			const { data, error } = await db.from("v2_models").select("model_slug,name,lab_slug").order("model_slug").range(offset, offset + 499);
			if (error) throw error;
			for (const row of data ?? []) {
				dbIds.add(row.model_slug);
				if (!entries.some((entry) => entry.model.model_id === row.model_slug)) entries.push({ file: null, model: { model_id: row.model_slug, name: row.name, organisation_id: row.lab_slug } });
			}
			if ((data ?? []).length < 500) break;
		}
	}
	for (const id of Object.keys(config.models)) if (!entries.some((entry) => entry.model.model_id === id)) throw new Error(`Mapping references unknown Phaseo model ${id}.`);
	const source = await fetchModels(apiKey);
	const plan = entries.map((entry) => ({ ...entry, match: matchModel(entry.model, source.models, config) }));
	const report = { version: source.version, sourceModels: source.models.length,
		matched: plan.filter((entry) => entry.match.status === "matched").length,
		models: plan.map((entry) => ({ model_id: entry.model.model_id, status: entry.match.status, source_id: entry.match.source?.id, source_name: entry.match.source?.name, candidates: entry.match.candidates.map(({ id, name, slug }) => ({ id, name, slug })) })),
		unmappedSources: source.models.filter((model) => !plan.some((entry) => entry.match.source?.id === model.id)).map(({ id, name, slug }) => ({ id, name, slug })),
	};
	const reportArg = process.argv.find((arg) => arg.startsWith("--report="));
	if (reportArg) writeJson(resolve(reportArg.slice("--report=".length)), report);
	console.log(`Artificial Analysis v${source.version}: ${report.matched}/${entries.length} Phaseo models matched; ${source.models.length} source models.`);
	for (const status of ["ambiguous", "unmatched", "excluded"]) console.log(`${status}: ${plan.filter((entry) => entry.match.status === status).length}`);
	if (!report.matched) throw new Error("No models matched; no benchmark data was written.");
	if (!write) { console.log("Dry run complete. Use --write to update the catalog; --write --sync-db also updates Supabase."); return; }
	const metadata = METRICS.map((metric) => ({ benchmark_id: metric.id, benchmark_name: metric.name, category: metric.field === "total_cost" ? "cost" : metric.field === "artificial_analysis_coding_index" ? "coding" : metric.field === "artificial_analysis_agentic_index" ? "agentic" : "general", ascending_order: metric.higherBetter, type: "numerical", link: "https://artificialanalysis.ai/data-api/docs", total_models: source.models.filter((model) => metricValue(model, metric) !== null).length }));
	for (const benchmark of metadata) writeJson(join(DATA_ROOT, "benchmarks", benchmark.benchmark_id, "benchmark.json"), benchmark);
	for (const entry of plan) {
		// Retain unmatched models' previous results and provenance until explicitly mapped.
		if (!entry.match.source) continue;
		entry.model.benchmarks = mergeResults(entry.model, resultsFor(entry.match.source, source.version, source.models));
		if (entry.file) writeJson(entry.file, entry.model);
	}
	if (!db) return;
	const updated_at = new Date().toISOString();
	const { error } = await db.from("v2_benchmarks").upsert(metadata.map(({ benchmark_name, type, ...rest }) => ({ ...rest, name: benchmark_name, benchmark_type: type, updated_at })), { onConflict: "benchmark_id" });
	if (error) throw error;
	for (const entry of plan) {
		if (!entry.match.source || !dbIds.has(entry.model.model_id)) continue;
		const rows = (entry.model.benchmarks ?? []).flatMap((result, index) => {
			if (!METRICS.some((metric) => metric.id === result.benchmark_id)) return [];
			const result_key = `${entry.model.model_id}:${result.benchmark_id}::${index}`;
			return [{ result_id: stableUuid(`benchmark-result:${result_key}`), model_slug: entry.model.model_id, benchmark_id: result.benchmark_id, score: String(result.score), score_numeric: result.score, is_self_reported: false, other_info: result.other_info, source_link: result.source_link, rank: result.rank, occur_idx: index, variant: null, result_key, updated_at }];
		});
		if (rows.length) {
			const { error } = await db.from("v2_benchmark_results").upsert(rows, { onConflict: "result_id" });
			if (error) throw error;
		}
		// Scope cleanup to this matched model, after its replacement succeeds.
		const { data: old, error: readError } = await db.from("v2_benchmark_results").select("result_id").eq("model_slug", entry.model.model_id).in("benchmark_id", METRICS.map((metric) => metric.id));
		if (readError) throw readError;
		const stale = (old ?? []).filter((row) => !rows.some((result) => result.result_id === row.result_id)).map((row) => row.result_id);
		// Saved catalogue records cannot be deleted. Withdraw obsolete scores in place.
		if (stale.length) { const { error } = await db.from("v2_benchmark_results").update({ score: null, score_numeric: null, rank: null, updated_at }).in("result_id", stale); if (error) throw error; }
	}
	console.log("Synchronized matched database models. Public caches expire under their normal TTLs.");
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
