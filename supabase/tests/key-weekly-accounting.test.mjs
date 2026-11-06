import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Execute each production accounting query against a week spanning two months. A request that
// did not succeed but was charged (a cancelled stream that was billed) counts toward cost, not
// toward the request count; one that was not charged counts toward neither.
const db = new PGlite();
try {
  await db.exec(`create table public.gateway_requests(key_id text,workspace_id text,success boolean,created_at timestamptz,cost_nanos bigint);
    insert into public.gateway_requests values
      ('key','workspace',true,'2026-09-29',7),('key','workspace',true,'2026-10-01',11),
      ('key','workspace',true,'2026-09-27',99),('key','workspace',false,'2026-09-29',0),
      ('key','workspace',false,'2026-09-30',5),('key','workspace',null,'2026-10-01',3),
      ('foreign','workspace',true,'2026-09-29',99),('key','foreign',true,'2026-09-29',99),
      ('key','foreign',false,'2026-09-29',99);
    -- Unbilled spend (private.unbilled_spend): one charge without a request row, on 2026-09-30.
    create schema private;
    create function private.unbilled_spend(p_workspace_id text, p_since timestamptz, p_key_ids text[])
      returns table (kind text, billing_request_id text, key_id text, at timestamptz, nanos bigint, recorded_nanos bigint)
      language sql as $$ select 'charge', 'b1', 'key', '2026-09-30'::timestamptz, 4::bigint, 4::bigint
        where p_workspace_id = 'workspace' and 'key' = any (p_key_ids) and '2026-09-30' >= p_since $$;`);
  for (const path of ['private/functions/gateway_context_access.sql', 'public/functions/gateway_fetch_request_context_without_workspace_budget.sql']) {
    const source = await readFile(new URL(`../schemas/${path}`, import.meta.url), 'utf8');
    const statement = source.match(/select\s+count\(\*\) filter \(where gr\.served and gr\.created_at >= day_start\)[\s\S]*?\) gr;/i)?.[0];
    assert.ok(statement, `Missing accounting query: ${path}`);
    const query = statement.replace(/\s+into\s+used_day_reqs[\s\S]*?(?=\s+--|\s+from \()/i, '')
      .replace(/gateway_\w+\.api_key_id/g, "'key'").replace(/gateway_\w+\.workspace_id/g, "'workspace'")
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
