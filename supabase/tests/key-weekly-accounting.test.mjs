import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Execute each production accounting query, with the real private.key_spend_items it reads, against
// a week spanning two months. A request that did not succeed but was charged (a cancelled stream
// that was billed) counts toward cost, not toward the request count; one that was not charged counts
// toward neither.
const KEY = '30000000-0000-4000-8000-000000000001';
const WS = '10000000-0000-4000-8000-000000000001';
const FOREIGN = '90000000-0000-4000-8000-000000000001';
const schema = (path) => readFile(new URL(`../schemas/${path}`, import.meta.url), 'utf8');
const db = new PGlite();
try {
  await db.exec(`create role service_role; create role anon; create role authenticated; create schema private;
    create table public.gateway_requests(key_id uuid, workspace_id uuid, success boolean, created_at timestamptz, cost_nanos bigint,
      request_id text not null default gen_random_uuid()::text, billing_request_id text, expected_cost_nanos bigint, detail_metadata jsonb, endpoint text);
    create table public.gateway_request_charges(workspace_id uuid, request_id text, status text, cost_nanos bigint);
    create table public.credit_ledger(workspace_id uuid, ref_type text, ref_id text, source_ref_type text, source_ref_id text);
    create table public.gateway_wallet_reservations(workspace_id uuid, reservation_id text, status text);
    insert into public.gateway_requests (key_id, workspace_id, success, created_at, cost_nanos) values
      ('${KEY}','${WS}',true,'2026-09-29',7),('${KEY}','${WS}',true,'2026-10-01',11),
      ('${KEY}','${WS}',true,'2026-09-27',99),('${KEY}','${WS}',false,'2026-09-29',0),
      ('${KEY}','${WS}',false,'2026-09-30',5),('${KEY}','${WS}',null,'2026-10-01',3),
      ('${FOREIGN}','${WS}',true,'2026-09-29',99),('${KEY}','${FOREIGN}',true,'2026-09-29',99),
      ('${KEY}','${FOREIGN}',false,'2026-09-29',99);
    -- Unbilled spend (private.unbilled_spend): one charge without a request row, on 2026-09-30.
    create function private.unbilled_spend(p_workspace_id uuid, p_since timestamptz, p_key_ids uuid[], p_exclude_request_ids text[], p_exclude_charge_ids text[])
      returns table (kind text, billing_request_id text, key_id uuid, at timestamptz, nanos bigint)
      language sql as $$ select 'charge', 'b1', '${KEY}'::uuid, '2026-09-30'::timestamptz, 4::bigint
        where p_workspace_id = '${WS}' and '${KEY}' = any (p_key_ids) and '2026-09-30' >= p_since $$;`);
  await db.exec(await readFile(new URL('../migrations/20261110112506_billing_cutoffs.sql', import.meta.url), 'utf8'));
  await db.exec(await schema('private/functions/key_spend_items.sql'));
  for (const path of ['private/functions/gateway_context_access.sql', 'public/functions/gateway_fetch_request_context_without_workspace_budget.sql']) {
    const source = await schema(path);
    const statement = source.match(/select\s+count\(\*\) filter \(where gr\.served and gr\.at >= day_start\)[\s\S]*?\) gr;/i)?.[0];
    assert.ok(statement, `Missing accounting query: ${path}`);
    const query = statement.replace(/\s+into\s+used_day_reqs[\s\S]*?(?=\s+--|\s+from )/i, '')
      .replace(/gateway_\w+\.api_key_id/g, `'${KEY}'::uuid`).replace(/gateway_\w+\.workspace_id/g, `'${WS}'::uuid`)
      .replace(/\bday_start\b/g, "'2026-10-01'::timestamptz").replace(/\bweek_start\b/g, "'2026-09-28'::timestamptz")
      .replace(/\bmonth_start\b/g, "'2026-10-01'::timestamptz").replace(/;$/, '');
    const result = await db.query(query);
    assert.equal(Number(result.rows[0].used_wk_reqs), 2, path);
    assert.equal(Number(result.rows[0].used_wk_cost), 7 + 11 + 5 + 3 + 4, path);
    assert.equal(Number(result.rows[0].used_mo_reqs), 1, path);
    assert.equal(Number(result.rows[0].used_mo_cost), 11 + 3, path);
    assert.equal(Number(result.rows[0].used_day_reqs), 1, path);
  }
  console.log('Weekly accounting includes prior-month requests and charged unsuccessful requests (cost only); day/month and workspace/key boundaries retained.');
} finally { await db.close(); }
