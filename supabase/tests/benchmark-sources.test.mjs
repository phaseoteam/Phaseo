// Scraped benchmark results (source_id set) update in place, may be deleted and stay out of catalogue row history;
// hand-entered results keep the end-date rule and their history. Runs the real migration against minimal stubs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const { PGlite } = await import(process.env.PGLITE_MODULE ?? "@electric-sql/pglite");
const migration = readFileSync(new URL("../migrations/20261121172100_benchmark_sources.sql", import.meta.url), "utf8");

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
