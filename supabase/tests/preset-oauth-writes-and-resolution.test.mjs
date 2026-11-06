// Standalone PostgreSQL regression test for preset content and preset references (2026-11-06 review).
// 1. Tokens the auth provider's OAuth server issues to apps (and to the CLI and desktop app, whose client
//    IDs are public) carry a client_id claim. Through the Data API they could create, change and delete
//    presets as the person. Restrictive policies now refuse any write from such a token on presets,
//    preset_versions and preset_version_labels, while the person's own session (no client_id) and reads are
//    unaffected.
// 2. The gateway resolves "@slug" case-insensitively and took "limit 1", so two presets whose slugs differ only
//    in case resolved arbitrarily. A unique index prevents that among non-archived presets, and both gateway
//    context functions refuse a reference that still matches two.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/preset-oauth-writes-and-resolution.test.mjs
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8').then((text) => text.replace(/\r\n/g, '\n').trim());
const migrationName = (await readdir(new URL('../migrations/', import.meta.url))).find((name) => name.endsWith('_preset_oauth_writes_and_unique_resolution.sql'));
assert(migrationName, 'the migration exists');
const migration = await read(`../migrations/${migrationName}`);
const presetsSql = await read('../schemas/public/tables/presets.sql');
const contextFiles = [
  ['gateway_context_access', '../schemas/private/functions/gateway_context_access.sql'],
  ['gateway_fetch_request_context_without_workspace_budget', '../schemas/public/functions/gateway_fetch_request_context_without_workspace_budget.sql'],
];

// The declarative files carry the same statements as the migration.
for (const table of ['presets', 'preset_versions', 'preset_version_labels']) {
  const sql = await read(`../schemas/public/tables/${table}.sql`);
  for (const op of ['insert', 'update', 'delete']) {
    const policy = sql.match(new RegExp(`CREATE POLICY "${table}_no_oauth_client_${op}"[\\s\\S]*?;`))?.[0];
    assert(policy && migration.includes(policy), `${table}.sql and the migration share the ${op} policy`);
  }
}
const index = presetsSql.match(/CREATE UNIQUE INDEX presets_workspace_resolution_key[\s\S]*?;/)?.[0];
assert(index && migration.includes(index), 'presets.sql and the migration share the resolution index');
for (const [, path] of contextFiles) assert(migration.includes(await read(path)), `the migration ships ${path} verbatim`);

// The preset lookup block of a gateway context function, run inside a small function of the same name so its
// qualified parameter references (gateway_context_access.workspace_id, ...) resolve.
function presetLookup(name, source) {
  const start = source.indexOf("    if position('/' in preset_name) > 0 then");
  // Through the label lookup ("@slug@label") where the function has one.
  const end = source.indexOf('    -- Extract model from preset config', start);
  assert(start > 0 && end > start, `${name}: preset lookup block found`);
  return `create or replace function lookup.${name}(workspace_id uuid, api_key_id uuid, base_model text, preset_ref text default null) returns jsonb
    language plpgsql as $fn$
    declare preset_data jsonb := null; preset_matches jsonb := null; preset_name text; preset_publisher text := null; pinned_version jsonb := null;
    begin
      preset_name := substring(base_model from 2);
${source.slice(start, end)}
      return preset_data;
    end $fn$;`;
}

const ws = '20000000-0000-4000-8000-000000000001';
const person = '10000000-0000-4000-8000-000000000001';
const key = '30000000-0000-4000-8000-000000000001';
const db = new PGlite();
async function as(claims, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claims', '${JSON.stringify(claims)}', false);`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
}
async function rejects(promise, pattern, message) {
  await assert.rejects(promise, (error) => pattern.test(String(error?.message ?? error)), message);
}

try {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public to authenticated, service_role;
    create schema auth; create schema lookup;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
    create function public.mfa_satisfied() returns boolean language sql stable as $$ select true $$;
    create function public.is_workspace_member(p uuid) returns boolean language sql stable as $$ select true $$;
    grant execute on function public.mfa_satisfied(), public.is_workspace_member(uuid) to authenticated;

    create table public.workspaces (id uuid primary key, publisher_handle text);
    create table public.workspace_publisher_handle_aliases (workspace_id uuid, handle text);
    create table public.keys (id uuid primary key, workspace_id uuid, created_by uuid, status text);
    create table public.presets (
      id uuid primary key default gen_random_uuid(), workspace_id uuid not null, name text not null, slug text not null,
      description text, config jsonb not null default '{}', visibility text not null default 'team', created_by uuid,
      archived_at timestamptz, active_version_id uuid);
    alter table public.presets enable row level security;
    ${presetsSql.match(/CREATE POLICY [\s\S]*?;/g).filter((policy) => !policy.includes('no_oauth_client')).join('\n')}
    create table public.preset_versions (id uuid primary key default gen_random_uuid(), preset_id uuid, config jsonb, version_label text, name text, slug text, description text, visibility text);
    alter table public.preset_versions enable row level security;
    create table public.preset_version_labels (preset_id uuid, label text, version_id uuid);
    alter table public.preset_version_labels enable row level security;
    -- Production's grants and the old client policies on presets.
    grant delete, insert, update on public.presets to anon, authenticated;
    grant select on public.presets to authenticated;
    grant all on public.presets, public.preset_versions, public.preset_version_labels to service_role;

    insert into public.workspaces values ('${ws}', 'acme');
    insert into public.keys values ('${key}', '${ws}', '${person}', 'active');
  `);

  const session = { sub: person, role: 'authenticated', aal: 'aal1' };
  const appToken = { ...session, client_id: 'acme_reporting_app' };
  const cliToken = { ...session, client_id: 'phaseo_cli' };
  const preset = '40000000-0000-4000-8000-000000000001';
  await db.exec(`insert into public.presets (id, workspace_id, name, slug, created_by, config) values ('${preset}', '${ws}', '@support', 'support', '${person}', '{"model":"a"}')`);

  // Before: an app token writes presets through the Data API like the person.
  await db.exec('begin');
  await as(appToken, async () => {
    await db.query(`update public.presets set config = '{"model":"b"}' where id = $1`, [preset]);
    await db.query(`insert into public.presets (workspace_id, name, slug, created_by) values ($1, '@forged', 'forged', $2)`, [ws, person]);
  });
  assert.equal((await db.query(`select config->>'model' m from public.presets where id = $1`, [preset])).rows[0].m, 'b', 'before the fix an app token changes a preset');
  await db.exec('rollback');

  // Before: two presets whose slugs differ only in case, and the gateway picks one. Each has a "prod" label.
  const other = '40000000-0000-4000-8000-000000000002';
  await db.exec(`insert into public.presets (id, workspace_id, name, slug, created_by, config) values ('${other}', '${ws}', '@Support', 'Support', '${person}', '{"model":"c"}')`);
  const versions = { [preset]: '50000000-0000-4000-8000-000000000001', [other]: '50000000-0000-4000-8000-000000000002' };
  for (const [presetId, versionId] of Object.entries(versions)) {
    await db.exec(`insert into public.preset_versions (id, preset_id, config, version_label, name, slug, description, visibility)
      values ('${versionId}', '${presetId}', '{"model":"pinned"}', 'v1', 'n', 's', null, 'team');
      insert into public.preset_version_labels (preset_id, label, version_id) values ('${presetId}', 'prod', '${versionId}');`);
  }
  const labelled = 'gateway_fetch_request_context_without_workspace_budget';
  // The definitions before this change, from the last migrations that defined each function.
  const previous = {
    gateway_context_access: '20261008120651_codex_security_findings.sql',
    gateway_fetch_request_context_without_workspace_budget: '20261104124149_deranked_routes_are_a_last_resort.sql',
  };
  for (const [name] of contextFiles) {
    const file = await read(`../migrations/${previous[name]}`);
    const start = file.search(new RegExp(`FUNCTION "?(private|public)"?\\."?${name}"?\\s*\\(`));
    assert(start >= 0, `${previous[name]} defines ${name}`);
    const old = file.slice(start, file.indexOf('$function$;', start));
    await db.exec(presetLookup(name, old));
    const picked = (await db.query(`select lookup.${name}($1, $2, '@support') p`, [ws, key])).rows[0].p;
    assert(picked, `before the fix ${name} silently picks one of two matching presets`);
  }

  // After: the real functions refuse the ambiguous reference.
  for (const [name, path] of contextFiles) {
    await db.exec(presetLookup(name, await read(path)));
    await rejects(db.query(`select lookup.${name}($1, $2, '@support')`, [ws, key]), /preset_ambiguous/, `${name} refuses a reference that matches two presets`);
    await rejects(db.query(`select lookup.${name}($1, $2, '@SUPPORT')`, [ws, key]), /preset_ambiguous/, `${name} refuses it in any case`);
  }
  await rejects(db.query(`select lookup.${labelled}($1, $2, '@support', 'prod')`, [ws, key]), /preset_ambiguous/,
    'a label reference is refused too, instead of following one preset\'s label');

  // The migration's index can't be built while two non-archived presets collide (production had none); with
  // one archived it builds, and then the reference resolves to the one left.
  const policiesAndIndex = migration.slice(0, migration.indexOf('CREATE OR REPLACE FUNCTION'));
  await rejects(db.exec(policiesAndIndex), /could not create unique index|duplicate key/, 'the index refuses existing collisions');
  await db.exec(`update public.presets set archived_at = now() where slug = 'Support'`);
  await db.exec(policiesAndIndex);
  for (const [name] of contextFiles) {
    const found = (await db.query(`select lookup.${name}($1, $2, '@SUPPORT') p`, [ws, key])).rows[0].p;
    assert.equal(found.id, preset, `${name} resolves to the only non-archived match`);
  }
  const pinned = (await db.query(`select lookup.${labelled}($1, $2, '@SUPPORT', 'prod') p`, [ws, key])).rows[0].p;
  assert.equal(pinned.version_id, versions[preset], 'after archiving, the label resolves on the preset that is left, not the archived one');
  await rejects(db.query(`insert into public.presets (workspace_id, name, slug, created_by) values ($1, '@SUPPORT', 'SUPPORT', $2)`, [ws, person]),
    /duplicate key value violates unique constraint "presets_workspace_resolution_key"/, 'a case-colliding slug is refused');
  await rejects(db.query(`insert into public.presets (workspace_id, name, slug, created_by) values ($1, '@Support', '', $2)`, [ws, person]),
    /presets_workspace_resolution_key/, 'a slug-less preset whose name collides is refused too');
  await db.query(`insert into public.presets (workspace_id, name, slug, created_by, archived_at) values ($1, '@SUPPORT', 'SUPPORT', $2, now())`, [ws, person]);

  // After: OAuth client tokens can't write preset content; the person's session and reads still work.
  for (const token of [appToken, cliToken]) {
    await as(token, async () => {
      assert.equal((await db.query(`select id from public.presets where id = $1`, [preset])).rows.length, 1, `${token.client_id} still reads presets`);
      // The restrictive USING hides every row from an update, so nothing matches.
      const updated = await db.query(`update public.presets set config = '{"model":"b"}' where id = $1 returning id`, [preset]);
      assert.equal(updated.rows.length, 0, `${token.client_id} can't change a preset`);
      await rejects(db.query(`insert into public.presets (workspace_id, name, slug, created_by) values ($1, '@forged', 'forged', $2)`, [ws, person]),
        /row-level security/, `${token.client_id} can't create a preset`);
      const deleted = await db.query(`delete from public.presets where id = $1 returning id`, [preset]);
      assert.equal(deleted.rows.length, 0, `${token.client_id} can't delete a preset`);
    });
  }
  await as(session, async () => {
    await db.query(`update public.presets set config = '{"model":"d"}' where id = $1`, [preset]);
    await db.query(`insert into public.presets (workspace_id, name, slug, created_by) values ($1, '@mine', 'mine', $2)`, [ws, person]);
  });
  assert.equal((await db.query(`select config->>'model' m from public.presets where id = $1`, [preset])).rows[0].m, 'd', 'the person\'s session still writes');
  for (const table of ['presets', 'preset_versions', 'preset_version_labels']) {
    const { rows } = await db.query(`select count(*)::int n from pg_policy where polrelid = $1::regclass and polname like '%no_oauth_client%' and polpermissive = false`, [`public.${table}`]);
    assert.equal(rows[0].n, 3, `${table} has the three restrictive policies`);
  }
  await db.exec('set role service_role');
  await db.query(`update public.presets set config = '{"model":"e"}' where id = $1`, [preset]);
  await db.exec('reset role');

  console.log('preset-oauth-writes-and-resolution: all checks passed');
} finally {
  await db.close();
}
