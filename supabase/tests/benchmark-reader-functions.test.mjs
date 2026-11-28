// The benchmarks index and model pages read through two functions. This runs the real migration
// against minimal stubs and checks visibility, counts, rank direction, independent-first standing
// and the score scale rule (scraped rows are already points; legacy percentage rows may be fractions).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const { PGlite } = await import(process.env.PGLITE_MODULE ?? "@electric-sql/pglite");
const migrationFile = readdirSync(new URL("../migrations/", import.meta.url)).find((file) => file.endsWith("_benchmark_reader_functions.sql"));
const migration = readFileSync(new URL(`../migrations/${migrationFile}`, import.meta.url), "utf8");

for (const file of ["public/functions/get_benchmark_directory.sql", "public/functions/get_model_benchmark_profile.sql"]) {
	test(`${file} is registered with the declarative schema and matches the migration`, () => {
		const exported = JSON.parse(readFileSync(new URL("../schemas/.pgdelta-export.json", import.meta.url), "utf8"));
		assert.ok(exported.loadOrder.includes(file) && exported.files.includes(file));
		assert.ok(migration.includes(readFileSync(new URL(`../schemas/${file}`, import.meta.url), "utf8").trim()));
	});
}

async function seed() {
	const db = new PGlite();
	await db.exec(`
		create role anon; create role authenticated; create role service_role;
		create table public.v2_models (model_slug text primary key, hidden boolean not null default false, status text not null default 'active', released_at timestamptz);
		create table public.v2_model_provider_routes (model_slug text, is_stealth boolean not null default false);
		create table public.v2_benchmark_sources (source_id text primary key, name text not null, publisher text, url text not null, attribution text, last_success_at timestamptz);
		create table public.v2_benchmarks (benchmark_id text primary key, name text not null, category text, ascending_order boolean not null default true, benchmark_type text, source_id text, unit text);
		create table public.v2_benchmark_results (
			result_id uuid primary key default gen_random_uuid(), model_slug text not null, benchmark_id text not null,
			score text, score_numeric numeric, is_self_reported boolean not null default false, other_info text, source_link text,
			variant text, created_at timestamptz, updated_at timestamptz, effective_to timestamptz,
			source_id text, effort text, harness text, config text, ci_low numeric, ci_high numeric, cost_usd numeric,
			duration_seconds numeric, output_tokens numeric, observed_on date
		);
		insert into public.v2_models (model_slug) values ('lab/a'), ('lab/b'), ('lab/c');
		insert into public.v2_models (model_slug, hidden) values ('lab/hidden', true);
		insert into public.v2_models (model_slug, status) values ('lab/draft', 'draft');
		insert into public.v2_benchmark_sources values ('board', 'Board', 'Publisher', 'https://example.com', 'Data from Publisher', '2026-11-26T05:17:00Z');
		insert into public.v2_benchmarks values
			('elo', 'Elo board', 'general', true, 'numerical', 'board', 'Elo'),
			('cost', 'Cost board', 'cost', false, 'numerical', 'board', 'USD'),
			('pct', 'Percentage board', 'reasoning', true, 'percentage', null, '%'),
			('empty', 'No results', 'reasoning', true, 'percentage', null, '%');
		insert into public.v2_benchmark_results (model_slug, benchmark_id, score_numeric, source_id, effort, observed_on) values
			('lab/a', 'elo', 1500, 'board', 'high', '2026-11-20'),
			('lab/a', 'elo', 1450, 'board', 'low', '2026-11-20'),
			('lab/b', 'elo', 1480, 'board', null, '2026-11-22'),
			('lab/hidden', 'elo', 1600, 'board', null, '2026-11-25'),
			('lab/draft', 'elo', 1700, 'board', null, '2026-11-25'),
			('lab/a', 'cost', 2.5, 'board', null, null),
			('lab/b', 'cost', 1.0, 'board', null, null);
		-- pct: lab/a has an independent 0.76 (scraped, so 0.76 points) and a self-reported 90 (legacy, points);
		-- lab/b has a legacy fraction 0.5 (= 50 points); lab/c has an ended result.
		insert into public.v2_benchmark_results (model_slug, benchmark_id, score_numeric, source_id, is_self_reported, effective_to) values
			('lab/a', 'pct', 0.76, 'board', false, null),
			('lab/a', 'pct', 90, null, true, null),
			('lab/b', 'pct', 0.5, null, false, null),
			('lab/c', 'pct', 99, null, false, '2020-01-01');
	`);
	await db.exec(migration.replace(/^SET local check_function_bodies = off;$/m, ""));
	return db;
}

test("directory counts public models only, with freshness and source", async () => {
	const db = await seed();
	const rows = (await db.query("select * from public.get_benchmark_directory()")).rows;
	const byId = Object.fromEntries(rows.map((row) => [row.benchmark_id, row]));
	assert.deepEqual(Object.keys(byId).sort(), ["cost", "elo", "pct"]);
	assert.equal(Number(byId.elo.model_count), 2);
	assert.equal(Number(byId.elo.result_count), 3);
	assert.equal(byId.elo.source_name, "Board");
	assert.equal(byId.elo.unit, "Elo");
	assert.equal(byId.cost.higher_is_better, false);
	assert.equal(new Date(byId.elo.latest_observed_on).toISOString().slice(0, 10), "2026-11-22");
	// A benchmark without its own source takes the source most of its results come from.
	assert.equal(byId.pct.source_id, "board");
	assert.equal(Number(byId.pct.independent_count), 2);
	await db.close();
});

test("profile ranks among public models, honours direction and prefers independent results", async () => {
	const db = await seed();
	const rows = (await db.query("select * from public.get_model_benchmark_profile('lab/a')")).rows;
	const rank = (benchmark) => rows.filter((row) => row.benchmark_id === benchmark).map((row) => [Number(row.model_rank), Number(row.ranked_models)]);
	// Hidden and draft models with higher Elo don't count.
	assert.deepEqual(rank("elo"), [[1, 2], [1, 2]]);
	// Lower is better: 2.5 is behind 1.0.
	assert.deepEqual(rank("cost"), [[2, 2]]);
	// The independent 0.76 points stands, not the self-reported 90, so lab/b's legacy 0.5 (50 points) ranks first.
	assert.deepEqual(rank("pct"), [[2, 2], [2, 2]]);
	const scores = rows.filter((row) => row.benchmark_id === "pct").map((row) => Number(row.comparable_score)).sort((a, b) => a - b);
	assert.deepEqual(scores, [0.76, 90]);
	assert.equal(rows.find((row) => row.benchmark_id === "elo").source_attribution, "Data from Publisher");
	await db.close();
});
