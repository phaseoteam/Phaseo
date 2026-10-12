import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const db = new PGlite();
const ws1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const ws2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const usage = (slugs, workspaceId = null) => rows(
  `select workspace_id::text, model_slug, last_used_at::text
   from public.get_requested_model_last_used_by_workspace($1::text[], '2026-09-01T00:00:00Z'::timestamptz, $2::uuid)
   order by workspace_id, model_slug`, [slugs, workspaceId]);

try {
  // Minimal pre-existing objects the migration depends on (production shapes, trimmed).
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.workspace_settings (workspace_id uuid primary key, model_deprecation_alerts_enabled boolean not null default false);
    create table public.v2_request_facts (
      request_event_id bigserial primary key, workspace_id uuid not null, occurred_at timestamptz not null,
      requested_model_input text not null, requested_model_slug text, routed_model_slug text
    );
    grant select on public.v2_request_facts to service_role;
  `);
  await db.exec(await readFile(new URL('../migrations/20261012150000_model_deprecation_alert_usage.sql', import.meta.url), 'utf8'));
  await db.exec(`
    insert into public.v2_request_facts (workspace_id, occurred_at, requested_model_input, requested_model_slug, routed_model_slug) values
      ('${ws1}', '2026-09-10T00:00:00Z', 'old/model', 'old/model', 'old/model'),
      ('${ws1}', '2026-09-12T00:00:00Z', 'old/model', 'old/model', 'new/model'),
      ('${ws1}', '2026-08-20T00:00:00Z', 'other/old', 'other/old', 'other/old'),
      ('${ws2}', '2026-09-05T00:00:00Z', 'new/model', 'new/model', 'old/model'),
      ('${ws2}', '2026-09-06T00:00:00Z', 'other/old', 'other/old', 'other/old');
    insert into public.workspace_settings (workspace_id) values ('${ws1}');
  `);

  const [settings] = await rows(`select model_deprecation_alerts_include_admins as v from public.workspace_settings where workspace_id = $1`, [ws1]);
  assert.equal(settings.v, false, 'admins are not emailed unless the workspace opts in');

  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(usage(['old/model']), /permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');

  // Keyed on the requested model: ws1's request served by new/model still counts
  // as old/model, and ws2's request for new/model routed to old/model does not.
  assert.deepEqual(await usage(['old/model', 'other/old']), [
    { workspace_id: ws1, model_slug: 'old/model', last_used_at: '2026-09-12 00:00:00+00' },
    { workspace_id: ws2, model_slug: 'other/old', last_used_at: '2026-09-06 00:00:00+00' },
  ]);
  assert.deepEqual(await usage(['old/model', 'other/old'], ws2), [
    { workspace_id: ws2, model_slug: 'other/old', last_used_at: '2026-09-06 00:00:00+00' },
  ]);
  assert.deepEqual(await usage([]), []);
  console.log('model deprecation alert usage: ok');
} finally {
  await db.close();
}
