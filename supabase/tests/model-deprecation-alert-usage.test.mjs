import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const db = new PGlite();
const ws1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const ws2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const targets = (slugs, after = null, limit = 500) => rows(
  `select workspace_id::text, model_slugs, include_admins
   from public.get_model_deprecation_alert_targets($1::text[], '2026-09-01T00:00:00Z'::timestamptz, $2::uuid, $3::int)`, [slugs, after, limit]);
const usage = (slugs, workspaceId = null) => rows(
  `select workspace_id::text, model_slug, last_used_at::text
   from public.get_requested_model_last_used_by_workspace($1::text[], '2026-09-01T00:00:00Z'::timestamptz, $2::uuid)
   order by workspace_id, model_slug`, [slugs, workspaceId]);

try {
  // Minimal pre-existing objects the migration depends on (production shapes, trimmed).
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.workspace_settings (workspace_id uuid primary key, model_deprecation_alerts_enabled boolean not null default false);
    grant select on public.workspace_settings to service_role;
    create table public.v2_request_facts (
      request_event_id bigserial primary key, workspace_id uuid not null, occurred_at timestamptz not null,
      requested_model_input text not null, requested_model_slug text, routed_model_slug text
    );
    grant select on public.v2_request_facts to service_role;
  `);
  await db.exec(await readFile(new URL('../migrations/20261015110000_model_deprecation_alert_usage.sql', import.meta.url), 'utf8'));
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
    await assert.rejects(targets(['old/model']), /permission denied/);
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

  // Alert targets: only enabled workspaces, one row per workspace, filtered
  // before the limit so disabled workspaces never use up a page.
  await db.exec('reset role');
  const ws = (n) => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, '0')}`;
  await db.exec(`
    insert into public.v2_request_facts (workspace_id, occurred_at, requested_model_input, requested_model_slug)
    select ('bbbbbbbb-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, '2026-09-10T00:00:00Z', 'old/model', 'old/model'
    from generate_series(1, 1500) n;
    insert into public.v2_request_facts (workspace_id, occurred_at, requested_model_input, requested_model_slug) values
      ('${ws(1201)}', '2026-09-11T00:00:00Z', 'other/old', 'other/old'),
      ('${ws(1202)}', '2026-08-01T00:00:00Z', 'other/old', 'other/old');
    -- The first 1,200 callers have alerts off; only 1201-1203 opted in.
    insert into public.workspace_settings (workspace_id, model_deprecation_alerts_enabled)
    select ('bbbbbbbb-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, n between 1201 and 1203
    from generate_series(1, 1500) n;
    update public.workspace_settings set model_deprecation_alerts_include_admins = true where workspace_id = '${ws(1202)}';
    update public.workspace_settings set model_deprecation_alerts_enabled = true where workspace_id = '${ws1}';
  `);
  await db.exec('set role service_role');
  assert.deepEqual(await targets(['old/model', 'other/old']), [
    { workspace_id: ws1, model_slugs: ['old/model'], include_admins: false },
    { workspace_id: ws(1201), model_slugs: ['old/model', 'other/old'], include_admins: false },
    { workspace_id: ws(1202), model_slugs: ['old/model'], include_admins: true },
    { workspace_id: ws(1203), model_slugs: ['old/model'], include_admins: false },
  ]);
  // Keyset paging by workspace_id returns each workspace exactly once.
  const firstPage = await targets(['old/model', 'other/old'], null, 2);
  assert.deepEqual(firstPage.map((row) => row.workspace_id), [ws1, ws(1201)]);
  const secondPage = await targets(['old/model', 'other/old'], firstPage[1].workspace_id, 2);
  assert.deepEqual(secondPage.map((row) => row.workspace_id), [ws(1202), ws(1203)]);
  assert.deepEqual(await targets(['old/model', 'other/old'], ws(1203), 2), []);
  // The page size is clamped below PostgREST's 1,000-row cap.
  await db.exec('reset role');
  await db.exec(`update public.workspace_settings set model_deprecation_alerts_enabled = true`);
  await db.exec('set role service_role');
  assert.equal((await targets(['old/model'], null, 5000)).length, 1000);
  assert.equal((await targets(['old/model'], null, 0)).length, 1);
  console.log('model deprecation alert usage: ok');
} finally {
  await db.close();
}
