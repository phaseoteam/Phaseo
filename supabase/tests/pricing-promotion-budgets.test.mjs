import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const migration = await readFile(new URL('../migrations/20261109230000_pricing_promotion_budgets.sql', import.meta.url), 'utf8');

// The objects the migration depends on (production shapes, trimmed).
const prelude = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema cron;
  create table cron.job (jobid serial primary key, jobname text unique, schedule text, command text);
  create function cron.schedule(name text, schedule text, command text) returns bigint language sql as
    $$ insert into cron.job (jobname, schedule, command) values (name, schedule, command) returning jobid::bigint $$;
  create function cron.unschedule(name text) returns boolean language sql as
    $$ delete from cron.job where jobname = name returning true $$;
  create table public.v2_pricing_skus (
    sku_id uuid primary key,
    effective_to timestamptz,
    updated_at timestamptz not null default now()
  );
  create table public.v2_request_pricing_lines (
    pricing_line_id uuid primary key default gen_random_uuid(),
    sku_id uuid,
    charged_nanos bigint not null,
    created_at timestamptz not null default now()
  );
`;

const promoSku = '10000000-0000-4000-8000-000000000001';
const promoUsSku = '10000000-0000-4000-8000-000000000002';
const listSku = '10000000-0000-4000-8000-000000000003';

const db = new PGlite();
await db.exec(prelude);
await db.exec(migration);
// Running the migration twice keeps one scheduled job.
await db.exec(migration);
assert.equal((await db.query(`select count(*)::int as n from cron.job where jobname = 'enforce-pricing-promotion-budgets'`)).rows[0].n, 1);

await db.exec(`
  insert into public.v2_pricing_skus (sku_id, effective_to) values
    ('${promoSku}', now() + interval '2 days'),
    ('${promoUsSku}', now() + interval '2 days'),
    ('${listSku}', null);
  -- 25% off; budget $10 of list-price usage.
  insert into public.v2_pricing_promotions (label, sku_ids, discount_bps, budget_nanos, starts_at, ends_at)
  values ('test', array['${promoSku}', '${promoUsSku}']::uuid[], 2500, 10000000000, now() - interval '1 hour', now() + interval '2 days');
  -- Charged before the promotion started, and on the list SKU: neither counts.
  insert into public.v2_request_pricing_lines (sku_id, charged_nanos, created_at) values
    ('${promoSku}', 50000000000, now() - interval '2 hours'),
    ('${listSku}', 50000000000, now());
  -- $6 charged at 25% off = $8 of list-price usage, under the $10 budget.
  insert into public.v2_request_pricing_lines (sku_id, charged_nanos) values
    ('${promoSku}', 4000000000),
    ('${promoUsSku}', 2000000000);
`);

const state = async () => (await db.query(`
  select p.spent_nanos::bigint as spent, p.exhausted_at is not null as exhausted,
    (select count(*)::int from public.v2_pricing_skus s where s.sku_id = any(p.sku_ids) and s.effective_to <= now()) as ended_skus,
    (select effective_to is null from public.v2_pricing_skus where sku_id = '${listSku}') as list_open
  from public.v2_pricing_promotions p`)).rows[0];

assert.equal((await db.query('select public.enforce_pricing_promotion_budgets() as ended')).rows[0].ended, 0);
assert.deepEqual(await state(), { spent: 8000000000, exhausted: false, ended_skus: 0, list_open: true });

// Another $2 charged: $8 charged = $10.67 of list-price usage, over the budget.
await db.exec(`insert into public.v2_request_pricing_lines (sku_id, charged_nanos) values ('${promoSku}', 2000000000)`);
assert.equal((await db.query('select public.enforce_pricing_promotion_budgets() as ended')).rows[0].ended, 1);
assert.deepEqual(await state(), { spent: 10666666667, exhausted: true, ended_skus: 2, list_open: true });

// An exhausted promotion is not checked again.
assert.equal((await db.query('select public.enforce_pricing_promotion_budgets() as ended')).rows[0].ended, 0);

console.log('pricing promotion budgets: ok');
