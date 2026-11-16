// PGLITE_MODULE may point at an existing external PGlite installation.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

// The usage migration, then the one that added per_seat, applied in order.
const migrationFiles = (await readdir(new URL('../migrations/', import.meta.url)))
  .filter((file) => file.endsWith('_subscription_plan_model_usage.sql') || file.endsWith('_subscription_monthly_price_details.sql')).sort();
assert.equal(migrationFiles.length, 2);
const migrations = await Promise.all(migrationFiles.map((file) => readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8')));
const latest = migrations[1];
for (const schemaFile of ['public/functions/get_v2_subscription_monthly_price_details.sql', 'public/functions/get_v2_subscription_monthly_prices.sql']) {
  const schema = await readFile(new URL(`../schemas/${schemaFile}`, import.meta.url), 'utf8');
  assert.ok(latest.includes(schema.trim()), `${schemaFile} is copied verbatim into the latest migration`);
}
const migration = migrations[0];
for (const schemaFile of ['public/tables/v2_subscription_plan_model_usage.sql', 'public/functions/get_v2_subscription_model_usage.sql', 'public/functions/replace_v2_subscription_model_usage.sql']) {
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
      frequency text, price numeric, currency text, effective_to timestamptz, status text not null default 'active');
    create table v2_subscription_plan_models(plan_uuid uuid not null, model_slug text not null, effective_from timestamptz not null default '-infinity', effective_to timestamptz);
    create table v2_subscription_plan_offers(offer_uuid uuid primary key, plan_uuid uuid not null, billing_interval text, billing_interval_count int not null default 1,
      currency text not null default 'USD', region_code text, effective_from timestamptz not null default '-infinity', effective_to timestamptz);
    create table v2_subscription_offer_prices(offer_uuid uuid not null, component_key text not null default 'base', charge_basis text not null default 'account', pricing_type text not null, amount numeric, phase text not null default 'standard', starts_at_cycle int not null default 1, duration_cycles int,
      effective_from timestamptz not null default '-infinity', effective_to timestamptz);
    insert into v2_models values ('lab/model', 'Lab Model', false), ('lab/hidden', 'Hidden', true);
    -- Legacy price columns are historical; Max's current price lives in its offers.
    insert into v2_subscription_plans values
      (md5('max')::uuid, 'max', 'Max', 'lab', 'monthly', 999, 'USD', null),
      (md5('custom')::uuid, 'custom', 'Custom', 'lab', 'custom', 0, 'USD', null);
    insert into v2_subscription_plan_models(plan_uuid, model_slug) values
      (md5('max')::uuid, 'lab/model'), (md5('custom')::uuid, 'lab/model'), (md5('max')::uuid, 'lab/hidden');
    insert into v2_subscription_plan_offers(offer_uuid, plan_uuid, billing_interval, effective_to) values
      (md5('max-old')::uuid, md5('max')::uuid, 'month', now() - interval '1 day'),
      (md5('max-month')::uuid, md5('max')::uuid, 'month', null),
      (md5('max-year')::uuid, md5('max')::uuid, 'year', null),
      (md5('custom-quote')::uuid, md5('custom')::uuid, 'month', null);
    insert into v2_subscription_offer_prices(offer_uuid, pricing_type, amount, effective_to) values
      (md5('max-old')::uuid, 'fixed', 150, null),
      (md5('max-month')::uuid, 'fixed', 180, now() - interval '1 day'),
      (md5('max-month')::uuid, 'fixed', 200, null),
      (md5('max-year')::uuid, 'fixed', 1200, null),
      (md5('custom-quote')::uuid, 'custom', null, null);
    -- A first-cycle-only charge and an introductory phase aren't the ongoing price.
    insert into v2_subscription_offer_prices(offer_uuid, pricing_type, amount, duration_cycles) values (md5('max-month')::uuid, 'fixed', 1, 1);
    insert into v2_subscription_offer_prices(offer_uuid, pricing_type, amount, phase) values (md5('max-month')::uuid, 'fixed', 2, 'introductory');
    -- A renewal price from cycle 2 replaces the first-cycle price.
    insert into v2_subscription_plans(plan_uuid, plan_id, name, lab_slug) values (md5('renew')::uuid, 'renew', 'Renew', 'other');
    insert into v2_subscription_plan_offers(offer_uuid, plan_uuid, billing_interval) values (md5('renew-month')::uuid, md5('renew')::uuid, 'month');
    insert into v2_subscription_offer_prices(offer_uuid, pricing_type, amount, starts_at_cycle) values (md5('renew-month')::uuid, 'fixed', 20, 1), (md5('renew-month')::uuid, 'fixed', 30, 2);
    -- A separate charge that starts later adds to the base instead of replacing it: $50 base + $20 seat.
    insert into v2_subscription_plans(plan_uuid, plan_id, name, lab_slug) values (md5('stack')::uuid, 'stack', 'Stack', 'stacked');
    insert into v2_subscription_plan_offers(offer_uuid, plan_uuid, billing_interval) values (md5('stack-month')::uuid, md5('stack')::uuid, 'month');
    insert into v2_subscription_offer_prices(offer_uuid, component_key, pricing_type, amount, starts_at_cycle) values (md5('stack-month')::uuid, 'base', 'fixed', 50, 1), (md5('stack-month')::uuid, 'seat', 'fixed', 20, 2);
    -- A team plan charged per seat, with a free account-level component.
    insert into v2_subscription_plans(plan_uuid, plan_id, name, lab_slug) values (md5('team')::uuid, 'team', 'Team', 'team');
    insert into v2_subscription_plan_offers(offer_uuid, plan_uuid, billing_interval) values (md5('team-month')::uuid, md5('team')::uuid, 'month');
    insert into v2_subscription_offer_prices(offer_uuid, component_key, charge_basis, pricing_type, amount) values (md5('team-month')::uuid, 'seat', 'seat', 'fixed', 25), (md5('team-month')::uuid, 'base', 'account', 'free', null);
  `);
  await db.exec(migration);
  await db.exec(latest);
  await db.exec(`
    insert into v2_subscription_plan_model_usage(plan_uuid, model_slug, scenario, monthly_tokens, workload, basis, confidence, plan_price_usd, api_equivalent_usd_per_mtok, source_name, effective_from)
    values (md5('max')::uuid, 'lab/model', 'standard', 20000000000, 'measured', 'measured', 'high', 190, 0.5, 'test', now() - interval '1 day'),
      (md5('custom')::uuid, 'lab/model', 'standard', 1000000, 'unknown', 'assumed', 'low', 30, null, 'test', now() - interval '1 day');
  `);

  const { rows } = await db.query(`select plan_id, model_name, monthly_price_usd::float, effective_usd_per_mtok::float, share_of_api_price::float from get_v2_subscription_model_usage('LAB/model ') order by plan_id`);
  // The plan's live monthly offer price wins; the source price is the fallback when there's no fixed monthly price.
  assert.deepEqual(rows, [
    { plan_id: 'custom', model_name: 'Lab Model', monthly_price_usd: 30, effective_usd_per_mtok: 30, share_of_api_price: null },
    { plan_id: 'max', model_name: 'Lab Model', monthly_price_usd: 200, effective_usd_per_mtok: 0.01, share_of_api_price: 0.02 },
  ]);

  const monthly = await db.query(`select plan_uuid = md5('max')::uuid as is_max, monthly_price_usd::float from get_v2_subscription_monthly_prices('lab')`);
  assert.deepEqual(monthly.rows, [{ is_max: true, monthly_price_usd: 200 }], 'monthly prices per lab, aggregated in the database');
  const renewal = await db.query(`select monthly_price_usd::float from get_v2_subscription_monthly_prices('other')`);
  assert.deepEqual(renewal.rows, [{ monthly_price_usd: 30 }], 'the renewal price is the ongoing price');
  const stacked = await db.query(`select monthly_price_usd::float from get_v2_subscription_monthly_prices('stacked')`);
  assert.deepEqual(stacked.rows, [{ monthly_price_usd: 70 }], 'charges with different keys all count');
  const seat = await db.query(`select monthly_price_usd::float, per_seat from get_v2_subscription_monthly_price_details('team')`);
  assert.deepEqual(seat.rows, [{ monthly_price_usd: 25, per_seat: true }], 'a price charged only per seat is marked per seat');
  const account = await db.query(`select per_seat from get_v2_subscription_monthly_price_details('lab') union all select per_seat from get_v2_subscription_monthly_price_details('stacked')`);
  assert.deepEqual(account.rows, [{ per_seat: false }, { per_seat: false }], 'account and mixed charges are not per seat');

  const byPlan = await db.query(`select plan_id from get_v2_subscription_model_usage(null, 'custom')`);
  assert.deepEqual(byPlan.rows, [{ plan_id: 'custom' }], 'filters by plan');

  await assert.rejects(db.exec(`insert into v2_subscription_plan_model_usage(plan_uuid, model_slug, monthly_tokens, confidence, source_name) values (md5('max')::uuid, 'lab/model', 5, 'high', 'test')`), /duplicate key/);
  await db.exec(`update v2_subscription_plan_model_usage set effective_to = now() where plan_uuid = md5('max')::uuid`);
  await db.exec(`insert into v2_subscription_plan_model_usage(plan_uuid, model_slug, monthly_tokens, confidence, source_name) values (md5('max')::uuid, 'lab/model', 4000000000, 'medium', 'test')`);
  const current = await db.query(`select effective_usd_per_mtok::float from get_v2_subscription_model_usage('lab/model') where plan_id = 'max'`);
  assert.deepEqual(current.rows, [{ effective_usd_per_mtok: 0.05 }], 'retired rows are excluded');

  await assert.rejects(db.exec(`insert into v2_subscription_plan_model_usage(plan_uuid, model_slug, monthly_tokens, confidence, source_name) values (md5('max')::uuid, 'lab/model', 0, 'high', 'other')`), /check/);

  // Replacing rows is all-or-nothing: a bad replacement leaves the published row current.
  const [{ usage_uuid: published }] = (await db.query(`select usage_uuid from v2_subscription_plan_model_usage where plan_uuid = md5('max')::uuid and effective_to is null`)).rows;
  const replacement = (tokens, price) => JSON.stringify([{ plan_uuid: md5Max, model_slug: 'lab/model', scenario: 'standard', monthly_tokens: tokens, workload: 'measured', basis: 'measured', confidence: 'high', plan_price_usd: price, source_name: 'test' }]);
  const md5Max = (await db.query(`select md5('max')::uuid as id`)).rows[0].id;
  await assert.rejects(db.query(`select replace_v2_subscription_model_usage($1, $2::jsonb, now())`, [[published], replacement(8000000000, -1)]), /check/);
  const kept = await db.query(`select usage_uuid from v2_subscription_plan_model_usage where plan_uuid = md5('max')::uuid and effective_to is null`);
  assert.deepEqual(kept.rows, [{ usage_uuid: published }], 'failed replacement keeps the published row');
  await db.query(`select replace_v2_subscription_model_usage($1, $2::jsonb, now())`, [[published], replacement(8000000000, 200)]);
  const replaced = await db.query(`select effective_usd_per_mtok::float from get_v2_subscription_model_usage('lab/model') where plan_id = 'max'`);
  assert.deepEqual(replaced.rows, [{ effective_usd_per_mtok: 0.025 }], 'successful replacement swaps the row');
  await assert.rejects(db.exec(`delete from v2_subscription_plan_model_usage`), /history preserved/);

  await db.exec(`insert into v2_subscription_plan_model_usage(plan_uuid, model_slug, monthly_tokens, confidence, source_name) values (md5('max')::uuid, 'lab/hidden', 1000000, 'high', 'test')`);
  const hidden = await db.query(`select model_slug from get_v2_subscription_model_usage('lab/hidden')`);
  assert.deepEqual(hidden.rows, [], 'the public reader never returns hidden models, even to a privileged caller');

  await db.exec(`update v2_subscription_plan_models set effective_to = now() where plan_uuid = md5('custom')::uuid`);
  const unlinked = await db.query(`select plan_id from get_v2_subscription_model_usage('lab/model') order by plan_id`);
  assert.deepEqual(unlinked.rows, [{ plan_id: 'max' }], 'a figure disappears as soon as the model leaves the plan');
  await db.exec(`grant usage on schema public to anon; grant select on v2_models to anon; set role anon`);
  const visible = await db.query(`select distinct model_slug from v2_subscription_plan_model_usage order by 1`);
  assert.deepEqual(visible.rows, [{ model_slug: 'lab/model' }], 'hidden models and retired rows stay private');
  console.log('subscription plan model usage tests passed');
} finally {
  await db.close();
}
