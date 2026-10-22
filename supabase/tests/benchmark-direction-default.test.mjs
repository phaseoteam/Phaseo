import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
const { PGlite } = await import(process.env.PGLITE_MODULE ?? "@electric-sql/pglite");

const db = new PGlite();
const admin = "10000000-0000-4000-8000-000000000001";
const migration = (await readdir(new URL("../migrations/", import.meta.url))).find((name) => name.endsWith("_benchmark_direction_default_higher.sql"));
assert.ok(migration, "the benchmark direction migration exists");
const save = (action, payload) => db.query(
	"select public.mutate_v2_admin_catalogue($1::uuid, 'benchmarks', $2, 'bench', $3::jsonb)",
	[admin, action, JSON.stringify(payload)],
);
const stored = async () => (await db.query("select ascending_order from public.v2_benchmarks where benchmark_id = 'bench'")).rows[0].ascending_order;

try {
	await db.exec(`
		create role anon; create role authenticated; create role service_role;
		create table public.users(user_id uuid primary key, role text);
		insert into public.users values ('${admin}', 'admin');
		create table public.v2_benchmarks(benchmark_id text primary key, name text, category text, link text, ascending_order boolean, updated_at timestamptz);
		create table public.v2_catalogue_admin_changes(actor_user_id uuid, resource_type text, resource_id text, action text, before_state jsonb, after_state jsonb);
		create table public.v2_catalogue_source_overrides(source_type text, source_key text, disposition text, actor_user_id uuid, resource_id text, updated_at timestamptz, primary key (source_type, source_key));
	`);
	await db.exec(await readFile(new URL(`../migrations/${migration}`, import.meta.url), "utf8"));

	await save("create", { name: "Bench" });
	assert.equal(await stored(), true, "a new benchmark without a direction is higher-is-better");
	await save("update", { name: "Bench", ascending_order: false });
	assert.equal(await stored(), false, "an explicit lower-is-better is saved");
	await save("update", { name: "Bench renamed" });
	assert.equal(await stored(), false, "an edit without a direction keeps the stored one");
	await save("update", { name: "Bench", ascending_order: true });
	assert.equal(await stored(), true, "an explicit higher-is-better is saved");
	console.log("Benchmark direction defaults to higher-is-better and edits keep the stored direction.");
} finally {
	await db.close();
}
