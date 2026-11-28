/**
 * Daily sync of public benchmark leaderboards into v2_benchmark_results.
 *
 *   pnpm data:sync-benchmark-sources [--only=arc-prize,weirdml] [--write] [--report=report.json]
 *
 * Without --write it fetches and matches only. With --write, each source's results are upserted in place, results the
 * board no longer lists are removed, and the source's observations are archived to the benchmark-source-archive bucket.
 * A source that fails or looks broken keeps its stored results; the others still run. Within a source, a benchmark that
 * comes back empty or far smaller keeps its stored results too. Sources disabled in v2_benchmark_sources are skipped
 * unless --only names them.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { gzipSync } from "node:zlib";
import { createAdminClient } from "../apps/web/src/utils/supabase/admin";
import { buildRows, protectedBenchmarks, refusalReason, type BuildReport, type ProtectedBenchmark } from "./benchmark-sources/core";
import { httpContext } from "./benchmark-sources/http";
import { ModelMatcher, type CatalogueAlias, type CatalogueModel, type ModelPin } from "./benchmark-sources/match";
import { SOURCES } from "./benchmark-sources/sources";
import type { BenchmarkDefinition, BenchmarkSource, SourceObservation } from "./benchmark-sources/types";

for (const file of ["apps/web/.env.local", ".env.local", ".env"]) {
	if (existsSync(resolve(file))) loadEnvFile(resolve(file));
}

type Db = ReturnType<typeof createAdminClient>;
type SourceOutcome = {
	sourceId: string;
	status: "ok" | "failed" | "refused" | "empty";
	error?: string;
	build?: BuildReport;
	written?: number;
	removed?: number;
	/** Benchmarks whose stored results were kept because the board returned too few for them. */
	warnings?: ProtectedBenchmark[];
	observations?: SourceObservation[];
};

const argument = (name: string) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const write = process.argv.includes("--write");
/** PostgREST and Postgres codes for a table that isn't there yet. */
const MISSING_TABLE = new Set(["PGRST205", "42P01"]);

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
			if (!write && MISSING_TABLE.has((error as { code?: string })?.code ?? "")) { console.warn("No pins table yet; matching without pins."); return []; }
			throw error;
		}),
	]);
	return new ModelMatcher(models, aliases, pins);
}

/** Source ids switched off in v2_benchmark_sources. A database without the table yet has none. */
async function disabledSources(db: Db): Promise<Set<string>> {
	const { data, error } = await db.from("v2_benchmark_sources").select("source_id,enabled");
	if (error) {
		if (MISSING_TABLE.has((error as { code?: string }).code ?? "")) return new Set();
		throw error;
	}
	return new Set((data ?? []).filter((row) => row.enabled === false).map((row) => row.source_id as string));
}

type StoredBenchmark = { benchmark_id: string; category: string | null; link: string | null; benchmark_type: string | null; description: string | null; unit: string | null; source_id: string | null };

/**
 * Writes the source's benchmark rows. A benchmark the source owns (new, tagged with this source, or untagged with no
 * hand-entered results) takes the source's metadata. One it shares with curated results or another source keeps its
 * name, description, category and direction; the source only fills fields that are empty.
 */
async function syncBenchmarks(db: Db, source: BenchmarkSource, benchmarks: BenchmarkDefinition[], now: string) {
	const { data, error } = await db.from("v2_benchmarks")
		.select("benchmark_id,category,link,benchmark_type,description,unit,source_id")
		.in("benchmark_id", benchmarks.map((benchmark) => benchmark.id));
	if (error) throw error;
	const existing = new Map(((data ?? []) as StoredBenchmark[]).map((row) => [row.benchmark_id, row]));
	const owned: BenchmarkDefinition[] = [];
	for (const benchmark of benchmarks) {
		const row = existing.get(benchmark.id);
		if (!row || row.source_id === source.id) { owned.push(benchmark); continue; }
		if (row.source_id === null) {
			const { count, error: countError } = await db.from("v2_benchmark_results").select("result_id", { count: "exact", head: true }).eq("benchmark_id", benchmark.id).is("source_id", null);
			if (countError) throw countError;
			if (!count) { owned.push(benchmark); continue; }
		}
		const fill = { category: benchmark.category, link: benchmark.url, benchmark_type: benchmark.type, description: benchmark.description, unit: benchmark.unit ?? null };
		const patch = Object.fromEntries(Object.entries(fill).filter(([column, value]) => value != null && row[column as keyof StoredBenchmark] == null));
		if (!Object.keys(patch).length) continue;
		const { error: updateError } = await db.from("v2_benchmarks").update({ ...patch, updated_at: now }).eq("benchmark_id", benchmark.id);
		if (updateError) throw updateError;
	}
	if (!owned.length) return;
	const { error: upsertError } = await db.from("v2_benchmarks").upsert(owned.map((benchmark) => ({
		benchmark_id: benchmark.id,
		name: benchmark.name,
		category: benchmark.category,
		link: benchmark.url,
		ascending_order: benchmark.higherIsBetter,
		benchmark_type: benchmark.type,
		description: benchmark.description,
		unit: benchmark.unit ?? null,
		source_id: source.id,
		updated_at: now,
	})), { onConflict: "benchmark_id" });
	if (upsertError) throw upsertError;
}

/** total_models counts every model with an active result on the benchmark: hand-entered and from every source. */
async function refreshModelCount(db: Db, benchmarkId: string, now: string) {
	const rows = await pages<{ model_slug: string }>((from, to) => db.from("v2_benchmark_results").select("model_slug")
		.eq("benchmark_id", benchmarkId).or(`effective_to.is.null,effective_to.gt.${now}`).order("result_id").range(from, to));
	const { error } = await db.from("v2_benchmarks").update({ total_models: new Set(rows.map((row) => row.model_slug)).size }).eq("benchmark_id", benchmarkId);
	if (error) throw error;
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
		? await pages<{ result_id: string; benchmark_id: string }>((from, to) => db.from("v2_benchmark_results").select("result_id,benchmark_id").eq("source_id", source.id).order("result_id").range(from, to))
		: [];
	const refusal = refusalReason(source, observations.length, rows.length, stored.length);
	if (refusal) return { sourceId: source.id, status: "refused", error: refusal, build: report, observations };
	const warnings = protectedBenchmarks(rows, stored);
	if (!write) return { sourceId: source.id, status: "ok", build: report, warnings, observations };

	// A protected benchmark keeps its stored rows untouched: no replacement, no removal, no new count.
	const kept = new Set(warnings.map((warning) => warning.benchmarkId));
	const benchmarks = source.benchmarks.filter((benchmark) => !kept.has(benchmark.id));
	const replacing = rows.filter((row) => !kept.has(row.benchmark_id));
	await syncBenchmarks(db, source, benchmarks, now);

	for (let index = 0; index < replacing.length; index += 500) {
		const { error } = await db.from("v2_benchmark_results").upsert(replacing.slice(index, index + 500), { onConflict: "result_id" });
		if (error) throw error;
	}
	const current = new Set(replacing.map((row) => row.result_id));
	const stale = stored.filter((row) => !kept.has(row.benchmark_id) && !current.has(row.result_id)).map((row) => row.result_id);
	for (let index = 0; index < stale.length; index += 200) {
		const { error } = await db.from("v2_benchmark_results").delete().eq("source_id", source.id).in("result_id", stale.slice(index, index + 200));
		if (error) throw error;
	}
	for (const benchmark of benchmarks) await refreshModelCount(db, benchmark.id, now);
	return { sourceId: source.id, status: "ok", build: report, written: replacing.length, removed: stale.length, warnings, observations };
}

/**
 * One archive object per source per day, `<YYYY-MM-DD>/<source_id>.json.gz`: a rerun of one source replaces only its
 * own object, and a run that didn't succeed never replaces a successful one from earlier that day.
 */
async function archive(db: Db, outcome: SourceOutcome, now: string) {
	const { sourceId, status, error, warnings, observations } = outcome;
	const body = gzipSync(JSON.stringify({ generatedAt: now, sourceId, status, error, warnings, observations }));
	const { error: uploadError } = await db.storage.from("benchmark-source-archive").upload(`${now.slice(0, 10)}/${sourceId}.json.gz`, body, { contentType: "application/gzip", upsert: status === "ok" });
	if (!uploadError) return;
	if (status !== "ok" && /exists|duplicate|409/i.test(`${uploadError.message} ${(uploadError as { statusCode?: string }).statusCode ?? ""}`)) {
		console.log(`${sourceId}: kept today's earlier archive`);
		return;
	}
	console.warn(`${sourceId}: archive upload failed: ${uploadError.message}`);
}

async function main() {
	const only = argument("only")?.split(",").map((id) => id.trim()).filter(Boolean);
	const unknown = only?.filter((id) => !SOURCES.some((source) => source.id === id)) ?? [];
	if (unknown.length) throw new Error(`Unknown source(s): ${unknown.join(", ")}`);
	const db = createAdminClient();
	// --only names sources explicitly, so it also runs ones that are switched off.
	const disabled = only ? new Set<string>() : await disabledSources(db);
	for (const id of disabled) if (SOURCES.some((source) => source.id === id)) console.log(`${id}: skipped (disabled)`);
	const sources = only ? SOURCES.filter((source) => only.includes(source.id)) : SOURCES.filter((source) => !disabled.has(source.id));
	if (!sources.length) { console.log("No enabled sources."); return; }
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
		for (const warning of outcome.warnings ?? []) {
			console.log(`${source.id}/${warning.benchmarkId}: ${warning.reason}`);
			if (process.env.GITHUB_ACTIONS === "true") console.log(`::warning::${source.id}/${warning.benchmarkId} ${warning.reason}`);
		}
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
			await archive(db, outcome, now);
		}
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
