// PGLITE_MODULE may point at an existing external PGlite installation.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const migrations = (await readdir(new URL('../migrations/', import.meta.url))).filter((file) => file.endsWith('_subscription_plan_model_usage.sql'));
assert.equal(migrations.length, 1);
const migration = await readFile(new URL(`../migrations/${migrations[0]}`, import.meta.url), 'utf8');
for (const schemaFile of ['public/tables/v2_subscription_plan_model_usage.sql', 'public/functions/get_v2_subscription_model_usage.sql']) {
  const schema = await readFile(new URL(`../schemas/${schemaFile}`, import.meta.url), 'utf8');
  assert.ok(migration.includes(schema.trim()), `${schemaFile} is copied verbatim into the migration`);
}

const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table v2_models(model_slug text primary key, name text not null, hidden boolean not null default false);
    create function catalog_model_is_public(text) returns boolean language sql stable as $$ select not hidden from v2_models where model_slug = $1 $$;
    create schema catalogue_private;
    create function catalogue_private.record_row_history() returns trigger language plpgsql as $$ begin return coalesce(new,old); end $$;
    create function prevent_catalogue_removal() returns trigger language plpgsql as $$ begin raise exception 'history preserved'; end $$;
    create table v2_subscription_plans(plan_uuid uuid primary key, plan_id text not null, name text not null, lab_slug text,
      frequency text, price numeric, currency text, effective_to timestamptz);
    insert into v2_models values ('lab/model', 'Lab Model', false), ('lab/hidden', 'Hidden', true);
    insert into v2_subscription_plans values
      (md5('max')::uuid, 'max', 'Max', 'lab', 'monthly', 200, 'USD', null),
      (md5('custom')::uuid, 'custom', 'Custom', 'lab', 'custom', 0, 'USD', null);
  `);
  await db.exec(migration);
  await db.exec(`
    insert into v2_subscription_plan_model_usage(plan_uuid, model_slug, scenario, monthly_tokens, workload, basis, confidence, plan_price_usd, api_equivalent_usd_per_mtok, source_name, effective_from)
    values (md5('max')::uuid, 'lab/model', 'standard', 20000000000, 'measured', 'measured', 'high', 190, 0.5, 'test', now() - interval '1 day'),
      (md5('custom')::uuid, 'lab/model', 'standard', 1000000, 'unknown', 'assumed', 'low', 30, null, 'test', now() - interval '1 day');
  `);

  const { rows } = await db.query(`select plan_id, model_name, monthly_price_usd::float, effective_usd_per_mtok::float, share_of_api_price::float from get_v2_subscription_model_usage('LAB/model ') order by plan_id`);
  // The catalogue's own monthly USD price wins; the source price is the fallback for non-monthly plans.
  assert.deepEqual(rows, [
    { plan_id: 'custom', model_name: 'Lab Model', monthly_price_usd: 30, effective_usd_per_mtok: 30, share_of_api_price: null },
    { plan_id: 'max', model_name: 'Lab Model', monthly_price_usd: 200, effective_usd_per_mtok: 0.01, share_of_api_price: 0.02 },
  ]);

  const byPlan = await db.query(`select plan_id from get_v2_subscription_model_usage(null, 'custom')`);
  assert.deepEqual(byPlan.rows, [{ plan_id: 'custom' }], 'filters by plan');

  await assert.rejects(db.exec(`insert into v2_subscription_plan_model_usage(plan_uuid, model_slug, monthly_tokens, confidence, source_name) values (md5('max')::uuid, 'lab/model', 5, 'high', 'test')`), /duplicate key/);
  await db.exec(`update v2_subscription_plan_model_usage set effective_to = now() where plan_uuid = md5('max')::uuid`);
  await db.exec(`insert into v2_subscription_plan_model_usage(plan_uuid, model_slug, monthly_tokens, confidence, source_name) values (md5('max')::uuid, 'lab/model', 4000000000, 'medium', 'test')`);
  const current = await db.query(`select effective_usd_per_mtok::float from get_v2_subscription_model_usage('lab/model') where plan_id = 'max'`);
  assert.deepEqual(current.rows, [{ effective_usd_per_mtok: 0.05 }], 'retired rows are excluded');

  await assert.rejects(db.exec(`insert into v2_subscription_plan_model_usage(plan_uuid, model_slug, monthly_tokens, confidence, source_name) values (md5('max')::uuid, 'lab/model', 0, 'high', 'other')`), /check/);
  await assert.rejects(db.exec(`delete from v2_subscription_plan_model_usage`), /history preserved/);

  await db.exec(`insert into v2_subscription_plan_model_usage(plan_uuid, model_slug, monthly_tokens, confidence, source_name) values (md5('max')::uuid, 'lab/hidden', 1000000, 'high', 'test')`);
  await db.exec(`grant usage on schema public to anon; grant select on v2_models to anon; set role anon`);
  const visible = await db.query(`select distinct model_slug from v2_subscription_plan_model_usage order by 1`);
  assert.deepEqual(visible.rows, [{ model_slug: 'lab/model' }], 'hidden models and retired rows stay private');
  console.log('subscription plan model usage tests passed');
} finally {
  await db.close();
}
