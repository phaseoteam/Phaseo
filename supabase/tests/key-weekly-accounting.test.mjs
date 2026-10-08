import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Execute each production accounting query against a week spanning two months.
const db = new PGlite();
try {
  await db.exec(`create table public.gateway_requests(key_id text,workspace_id text,success boolean,created_at timestamptz,cost_nanos bigint);
    insert into public.gateway_requests values
      ('key','workspace',true,'2026-09-29',7),('key','workspace',true,'2026-10-01',11),
      ('key','workspace',true,'2026-09-27',99),('key','workspace',false,'2026-09-29',99),
      ('foreign','workspace',true,'2026-09-29',99),('key','foreign',true,'2026-09-29',99);`);
  for (const path of ['private/functions/gateway_context_access.sql', 'private/functions/gateway_compiled_context_access.sql', 'public/functions/gateway_fetch_request_context_without_workspace_budget.sql']) {
    const source = await readFile(new URL(`../schemas/${path}`, import.meta.url), 'utf8');
    const statement = source.match(/select\s+count\(\*\) filter \(where gr\.created_at >= day_start\)[\s\S]*?from public\.gateway_requests gr[\s\S]*?;/i)?.[0];
    assert.ok(statement, `Missing accounting query: ${path}`);
    const query = statement.replace(/\s+into\s+used_day_reqs[\s\S]*?(?=\s+from public\.gateway_requests)/i, '')
      .replace(/gateway_\w+\.api_key_id/g, "'key'").replace(/gateway_\w+\.workspace_id/g, "'workspace'")
      .replace('from public.gateway_requests gr', 'from public.gateway_requests gr cross join bounds');
    const result = await db.query(`with bounds as (select '2026-10-01'::timestamptz day_start, '2026-09-28'::timestamptz week_start, '2026-10-01'::timestamptz month_start) ${query}`);
    assert.equal(Number(result.rows[0].used_wk_reqs), 2, path);
    assert.equal(Number(result.rows[0].used_wk_cost), 18, path);
    assert.equal(Number(result.rows[0].used_mo_reqs), 1, path);
    assert.equal(Number(result.rows[0].used_day_reqs), 1, path);
  }
  console.log('Weekly accounting includes prior-month requests; day/month and workspace/key boundaries retained.');
} finally { await db.close(); }
