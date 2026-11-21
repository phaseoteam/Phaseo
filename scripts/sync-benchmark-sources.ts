/**
 * Daily sync of public benchmark leaderboards into v2_benchmark_results.
 *
 *   pnpm data:sync-benchmark-sources [--only=arc-prize,weirdml] [--write] [--report=report.json]
 *
 * Without --write it fetches and matches only. With --write, each source's results are upserted in place, results the
 * board no longer lists are removed, and the day's observations are archived to the benchmark-source-archive bucket.
 * A source that fails or looks broken keeps its stored results; the others still run.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { gzipSync } from "node:zlib";
import { createAdminClient } from "../apps/web/src/utils/supabase/admin";
import { buildRows, refusalReason, type BuildReport } from "./benchmark-sources/core";
import { httpContext } from "./benchmark-sources/http";
import { ModelMatcher, type CatalogueAlias, type CatalogueModel, type ModelPin } from "./benchmark-sources/match";
import { SOURCES } from "./benchmark-sources/sources";
import type { BenchmarkSource, SourceObservation } from "./benchmark-sources/types";

for (const file of ["apps/web/.env.local", ".env.local", ".env"]) {
	if (existsSync(resolve(file))) loadEnvFile(resolve(file));
}

type Db = ReturnType<typeof createAdminClient>;
type SourceOutcome = { sourceId: string; status: "ok" | "failed" | "refused" | "empty"; error?: string; build?: BuildReport; written?: number; removed?: number; observations?: SourceObservation[] };

const argument = (name: string) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const write = process.argv.includes("--write");

async function pages<T>(load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
	const rows: T[] = [];
	for (let offset = 0; ; offset += 1000) {
		const { data, error } = await load(offset, offset + 999);
		if (error) throw error;
		rows.push(...(data ?? []));
		if ((data ?? []).length < 1000) return rows;
	}
}

async function loadMatcher(db: Db) {
	const [models, aliases, pins] = await Promise.all([
		pages<CatalogueModel>((from, to) => db.from("v2_models").select("model_slug,name,status,hidden").order("model_slug").range(from, to)),
		pages<CatalogueAlias>((from, to) => db.from("v2_model_aliases").select("alias_slug,model_slug").eq("enabled", true).order("alias_slug").range(from, to)),
		pages<ModelPin>((from, to) => db.from("v2_benchmark_source_model_pins").select("source_id,label,model_slug,effort,ignored").order("pin_id").range(from, to)).catch((error) => {
			// A dry run against a database without the migration yet still measures matching.
			if (!write && (error as { code?: string })?.code === "PGRST205") { console.warn("No pins table yet; matching without pins."); return []; }
			throw error;
		}),
	]);
	return new ModelMatcher(models, aliases, pins);
}

async function syncSource(db: Db, matcher: ModelMatcher, source: BenchmarkSource, now: string): Promise<SourceOutcome> {
	let observations: SourceObservation[];
	try {
		observations = await source.fetch(httpContext);
	} catch (error) {
		return { sourceId: source.id, status: "failed", error: error instanceof Error ? error.message : String(error) };
	}
	const { rows, report } = buildRows(source, observations, matcher, now);
	if (!observations.length) return { sourceId: source.id, status: "empty", build: report, observations };

	const stored = write
		? await pages<{ result_id: string }>((from, to) => db.from("v2_benchmark_results").select("result_id").eq("source_id", source.id).order("result_id").range(from, to))
		: [];
	const refusal = refusalReason(source, observations.length, rows.length, stored.length);
	if (refusal) return { sourceId: source.id, status: "refused", error: refusal, build: report, observations };
	if (!write) return { sourceId: source.id, status: "ok", build: report, observations };

	const { error: benchmarkError } = await db.from("v2_benchmarks").upsert(source.benchmarks.map((benchmark) => ({
		benchmark_id: benchmark.id,
		name: benchmark.name,
		category: benchmark.category,
		link: benchmark.url,
		ascending_order: benchmark.higherIsBetter,
		benchmark_type: benchmark.type,
		description: benchmark.description,
		unit: benchmark.unit ?? null,
		source_id: source.id,
		total_models: new Set(rows.filter((row) => row.benchmark_id === benchmark.id).map((row) => row.model_slug)).size,
		updated_at: now,
	})), { onConflict: "benchmark_id" });
	if (benchmarkError) throw benchmarkError;

	for (let index = 0; index < rows.length; index += 500) {
		const { error } = await db.from("v2_benchmark_results").upsert(rows.slice(index, index + 500), { onConflict: "result_id" });
		if (error) throw error;
	}
	const current = new Set(rows.map((row) => row.result_id));
	const stale = stored.map((row) => row.result_id).filter((id) => !current.has(id));
	for (let index = 0; index < stale.length; index += 200) {
		const { error } = await db.from("v2_benchmark_results").delete().eq("source_id", source.id).in("result_id", stale.slice(index, index + 200));
		if (error) throw error;
	}
	return { sourceId: source.id, status: "ok", build: report, written: rows.length, removed: stale.length, observations };
}

async function main() {
	const only = argument("only")?.split(",").map((id) => id.trim()).filter(Boolean);
	const unknown = only?.filter((id) => !SOURCES.some((source) => source.id === id)) ?? [];
	if (unknown.length) throw new Error(`Unknown source(s): ${unknown.join(", ")}`);
	const sources = only ? SOURCES.filter((source) => only.includes(source.id)) : SOURCES;
	const db = createAdminClient();
	const matcher = await loadMatcher(db);
	const now = new Date().toISOString();

	if (write) {
		const { error } = await db.from("v2_benchmark_sources").upsert(sources.map((source) => ({
			source_id: source.id, name: source.name, publisher: source.publisher, url: source.url, attribution: source.attribution, updated_at: now,
		})), { onConflict: "source_id" });
		if (error) throw error;
	}

	const outcomes: SourceOutcome[] = [];
	for (const source of sources) {
		let outcome: SourceOutcome;
		try {
			outcome = await syncSource(db, matcher, source, now);
		} catch (error) {
			outcome = { sourceId: source.id, status: "failed", error: error instanceof Error ? error.message : JSON.stringify(error) };
		}
		outcomes.push(outcome);
		const build = outcome.build;
		console.log(`${source.id}: ${outcome.status}${build ? `, ${build.observations} rows, ${build.rows} results, ${build.unmatched.length} unmatched labels` : ""}${outcome.removed ? `, ${outcome.removed} removed` : ""}${outcome.error ? ` (${outcome.error})` : ""}`);
		if (outcome.status !== "ok" && process.env.GITHUB_ACTIONS === "true") console.log(`::warning::${source.id} ${outcome.status}: ${outcome.error ?? "no rows"}`);
		if (write) {
			const { error } = await db.from("v2_benchmark_sources").update({
				last_run_at: now,
				last_status: outcome.status,
				last_error: outcome.error ?? null,
				...(outcome.status === "ok" ? { last_success_at: now, last_row_count: build?.observations ?? 0, last_matched_count: build?.rows ?? 0, unmatched_labels: build?.unmatched.slice(0, 200) ?? [] } : {}),
				updated_at: now,
			}).eq("source_id", source.id);
			if (error) throw error;
		}
	}

	if (write) {
		// One file per day; a later run the same day replaces it. This is the history of scraped results.
		const archive = gzipSync(JSON.stringify({ generatedAt: now, sources: outcomes.map(({ sourceId, status, error, observations }) => ({ sourceId, status, error, observations })) }));
		const { error } = await db.storage.from("benchmark-source-archive").upload(`${now.slice(0, 10)}.json.gz`, archive, { contentType: "application/gzip", upsert: true });
		if (error) console.warn(`Archive upload failed: ${error.message}`);
	}

	const reportPath = argument("report");
	if (reportPath) {
		const file = resolve(reportPath);
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, `${JSON.stringify({ generatedAt: now, write, sources: outcomes.map(({ observations: _observations, ...rest }) => rest) }, null, 2)}\n`);
	}
	const failed = outcomes.filter((outcome) => outcome.status === "failed");
	if (failed.length === outcomes.length) throw new Error("Every source failed.");
	if (!write) console.log("Dry run complete. Use --write to update the catalogue.");
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
