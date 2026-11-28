// Scraped benchmark results (source_id set) update in place, may be deleted and stay out of catalogue row history;
// hand-entered results keep the end-date rule and their history. Runs the real migration against minimal stubs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const { PGlite } = await import(process.env.PGLITE_MODULE ?? "@electric-sql/pglite");
const migration = readFileSync(new URL("../migrations/20261127100000_benchmark_sources.sql", import.meta.url), "utf8");

for (const file of ["public/tables/v2_benchmark_sources.sql", "public/tables/v2_benchmark_source_model_pins.sql", "public/functions/prevent_curated_benchmark_result_removal.sql"]) {
	test(`${file} is registered with the declarative schema`, () => {
		const exported = JSON.parse(readFileSync(new URL("../schemas/.pgdelta-export.json", import.meta.url), "utf8"));
		assert.ok(exported.loadOrder.includes(file) && exported.files.includes(file));
	});
}

test("scraped results skip history and may be removed; curated results may not", async () => {
	const db = new PGlite();
	await db.exec(`
		create role anon; create role authenticated; create role service_role;
		create schema catalogue_private; create schema storage;
		create table storage.buckets (id text primary key, name text, public boolean);
		create table public.v2_models (model_slug text primary key);
		create table public.v2_benchmarks (benchmark_id text primary key, name text not null);
		create table public.v2_benchmark_results (result_id uuid primary key, model_slug text not null references public.v2_models, benchmark_id text not null references public.v2_benchmarks, score text, updated_at timestamptz, effective_to timestamptz);
		create table public.v2_catalogue_row_history (event_id bigint generated always as identity, table_name text, operation text);
		create function public.prevent_catalogue_removal() returns trigger language plpgsql as $$ begin raise exception 'saved catalogue records cannot be deleted; set an end date instead'; end $$;
		create function catalogue_private.record_row_history() returns trigger language plpgsql as $$
		begin insert into public.v2_catalogue_row_history(table_name, operation) values (TG_TABLE_NAME, TG_OP); return coalesce(NEW, OLD); end $$;
		create trigger catalogue_no_removal before delete or truncate on public.v2_benchmark_results for each statement execute function public.prevent_catalogue_removal();
		create trigger catalogue_row_history after insert or delete or update on public.v2_benchmark_results for each row execute function catalogue_private.record_row_history();
		insert into public.v2_models values ('lab/a');
		insert into public.v2_benchmarks values ('bench', 'Bench');
	`);
	await db.exec(migration.replace(/^SET local check_function_bodies = off;$/m, ""));

	await db.exec(`
		insert into public.v2_benchmark_sources (source_id, name, url) values ('board', 'Board', 'https://example.com');
		insert into public.v2_benchmark_results (result_id, model_slug, benchmark_id, score, source_id) values ('00000000-0000-4000-8000-000000000001', 'lab/a', 'bench', '1', 'board');
		update public.v2_benchmark_results set score = '2' where source_id = 'board';
		delete from public.v2_benchmark_results where source_id = 'board';
	`);
	assert.equal((await db.query("select count(*)::int n from public.v2_catalogue_row_history")).rows[0].n, 0);

	// Boards publish mean token counts, and configurations beyond effort and harness.
	await db.exec("insert into public.v2_benchmark_results (result_id, model_slug, benchmark_id, score, source_id, output_tokens, config) values ('00000000-0000-4000-8000-000000000003', 'lab/a', 'bench', '1', 'board', 31644.2, 'with fallback')");
	assert.deepEqual((await db.query("select output_tokens::text tokens, config from public.v2_benchmark_results where result_id = '00000000-0000-4000-8000-000000000003'")).rows, [{ tokens: "31644.2", config: "with fallback" }]);
	await db.exec("delete from public.v2_benchmark_results where source_id = 'board'");

	await db.exec("insert into public.v2_benchmark_results (result_id, model_slug, benchmark_id, score) values ('00000000-0000-4000-8000-000000000002', 'lab/a', 'bench', '1')");
	await assert.rejects(db.exec("delete from public.v2_benchmark_results where source_id is null"), /cannot be deleted/);
	await assert.rejects(db.exec("truncate public.v2_benchmark_results"), /cannot be deleted/);
	assert.deepEqual((await db.query("select operation from public.v2_catalogue_row_history order by event_id")).rows.map((row) => row.operation), ["INSERT"]);

	await assert.rejects(db.exec("insert into public.v2_benchmark_source_model_pins (label) values ('Mixed Case')"), /check/);
	await assert.rejects(db.exec("insert into public.v2_benchmark_source_model_pins (label) values ('no target')"), /check/);
	await db.exec("insert into public.v2_benchmark_source_model_pins (label, ignored) values ('human panel', true)");
	await assert.rejects(db.exec("insert into public.v2_benchmark_source_model_pins (label, ignored) values ('human panel', true)"), /duplicate/);
	assert.equal((await db.query("select count(*)::int n from storage.buckets where id = 'benchmark-source-archive'")).rows[0].n, 1);
	await db.close();
});

test("synced percentages are stored in points: ranking and model results never scale them", async () => {
	const scale = readFileSync(new URL("../migrations/20261127100100_benchmark_source_score_scale.sql", import.meta.url), "utf8");
	for (const file of ["private/views/v2_rpc_benchmark_results_compat.sql", "public/functions/get_benchmark_result_rankings.sql", "public/functions/get_v2_model_benchmarks.sql"]) {
		const schema = readFileSync(new URL(`../schemas/${file}`, import.meta.url), "utf8").replace(/\r\n/g, "\n").replace(/^CREATE VIEW/, "CREATE OR REPLACE VIEW").trim();
		assert.ok(scale.replace(/\r\n/g, "\n").includes(schema), `${file} matches the migration`);
	}
	const db = new PGlite();
	await db.exec(`
		create role anon; create role authenticated; create role service_role;
		create schema private;
		create table public.v2_benchmarks (benchmark_id text primary key, name text, category text, link text, total_models integer, ascending_order boolean, benchmark_type text);
		create table public.v2_benchmark_results (result_id uuid primary key, model_slug text, benchmark_id text, score text, score_numeric numeric, is_self_reported boolean default false,
			other_info text, source_link text, rank integer, occur_idx integer default 0, variant text, result_key text, created_at timestamptz, updated_at timestamptz, effective_to timestamptz, source_id text);
		create table private.v2_rpc_benchmarks_compat (id text, ascending_order boolean, type text);
		create table private.v2_rpc_models_compat (model_id text, name text, release_date timestamptz, announcement_date timestamptz, organisation_id text, hidden boolean);
		create table private.v2_rpc_labs_compat (organisation_id text, name text, colour text);
		-- The bodies the migration replaces, with their old result types.
		create function public.get_benchmark_result_rankings(p_benchmark_ids text[] default null, p_model_id text default null, p_include_hidden boolean default false, p_limit_per_benchmark integer default null)
			returns table (result_id uuid) language sql as $$ select null::uuid $$;
		create function public.get_v2_model_benchmarks(p_model_slug text) returns table (result_id uuid) language sql as $$ select null::uuid $$;
	`);
	await db.exec(`begin; ${scale} commit;`);
	await db.exec(`
		insert into public.v2_benchmarks values ('arc', 'ARC', null, null, 5, true, 'percentage');
		insert into private.v2_rpc_benchmarks_compat values ('arc', true, 'percentage');
		insert into private.v2_rpc_models_compat values ('lab/a', 'A', null, null, 'lab', false), ('lab/b', 'B', null, null, 'lab', false),
			('lab/c', 'C', null, null, 'lab', false), ('lab/d', 'D', null, null, 'lab', false), ('lab/legacy', 'Legacy', null, null, 'lab', false);
		insert into public.v2_benchmark_results (result_id, model_slug, benchmark_id, score, score_numeric, source_id) values
			('00000000-0000-4000-8000-00000000000a', 'lab/a', 'arc', '0.21', 0.21, 'arc-prize'),
			('00000000-0000-4000-8000-00000000000b', 'lab/b', 'arc', '0.76', 0.76, 'arc-prize'),
			('00000000-0000-4000-8000-00000000000c', 'lab/c', 'arc', '1', 1.0, 'arc-prize'),
			('00000000-0000-4000-8000-00000000000d', 'lab/d', 'arc', '57', 57, 'arc-prize'),
			('00000000-0000-4000-8000-00000000000e', 'lab/legacy', 'arc', '0.76', 0.76, null);
	`);
	const ranked = (await db.query("select model_id, benchmark_rank::int rank, source_id from public.get_benchmark_result_rankings(array['arc'])")).rows;
	// The legacy 0.76 is a fraction (76%); sourced 0.21, 0.76 and 1.0 are points.
	assert.deepEqual(ranked, [
		{ model_id: "lab/legacy", rank: 1, source_id: null },
		{ model_id: "lab/d", rank: 2, source_id: "arc-prize" },
		{ model_id: "lab/c", rank: 3, source_id: "arc-prize" },
		{ model_id: "lab/b", rank: 4, source_id: "arc-prize" },
		{ model_id: "lab/a", rank: 5, source_id: "arc-prize" },
	]);
	assert.deepEqual((await db.query("select source_id from public.get_v2_model_benchmarks('lab/a')")).rows, [{ source_id: "arc-prize" }]);
	await db.close();
});

test("refresh_benchmark_total_models counts distinct models with active results across sources", async () => {
	const db = new PGlite();
	await db.exec(`
		create role anon; create role authenticated; create role service_role;
		create table public.v2_benchmarks (benchmark_id text primary key, total_models integer);
		create table public.v2_benchmark_results (model_slug text, benchmark_id text, source_id text, effective_to timestamptz);
		insert into public.v2_benchmarks values ('shared', null), ('gone', 4), ('other', 9);
		insert into public.v2_benchmark_results values
			('lab/a', 'shared', null, null), ('lab/a', 'shared', 'board', null), ('lab/b', 'shared', 'other-board', null),
			('lab/c', 'shared', null, '2000-01-01'), ('lab/a', 'gone', 'board', '2000-01-01'), ('lab/a', 'other', null, null);
	`);
	await db.exec(readFileSync(new URL("../schemas/public/functions/refresh_benchmark_total_models.sql", import.meta.url), "utf8"));
	await db.query("select public.refresh_benchmark_total_models(array['shared', 'gone'])");
	assert.deepEqual((await db.query("select benchmark_id, total_models from public.v2_benchmarks order by benchmark_id")).rows, [
		{ benchmark_id: "gone", total_models: 0 },
		{ benchmark_id: "other", total_models: 9 },
		{ benchmark_id: "shared", total_models: 2 },
	]);
	await db.close();
});
