// Standalone PostgreSQL regression test for the 2026-11-02 security review: signed-in users could write
// columns through PostgREST that the app's own checks never allow.
// - oauth_app_metadata: any workspace member could insert a "first-party" app or change a team app's
//   redirect URIs. Signed-in users now only read it; the API and web-api write it with the service role.
// - presets: a creator could move a preset into a workspace they don't belong to.
// - workspace_settings: an admin could rewrite the extended-log price and billing status.
// It also checks anon/authenticated lose TRUNCATE (which ignores RLS) on the touched tables.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/client-writable-security-columns.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();
const migrations = await readdir(new URL('../migrations/', import.meta.url));
const migrationName = migrations.find((name) => name.endsWith('_close_client_writable_security_columns.sql'));
assert(migrationName, 'the migration exists');
const migration = normalize(await read(`../migrations/${migrationName}`));

// The declarative files describe the same end state.
// A later migration (enforce_workspace_role_rules) also protects the sso_* columns, so the declarative body
// is the one the latest migration redefining the function ships.
const fnSql = normalize(await read('../schemas/public/functions/protect_data_contribution_settings.sql'));
const fnBody = fnSql.slice(fnSql.indexOf('$function$'), fnSql.lastIndexOf('$function$') + 10);
let latestFnMigration = '';
for (const name of migrations.filter((file) => file.endsWith('.sql')).sort()) {
  const sql = normalize(await read(`../migrations/${name}`));
  if (sql.includes('FUNCTION public.protect_data_contribution_settings()')) latestFnMigration = sql;
}
assert(fnBody.length > 20 && latestFnMigration.includes(fnBody), 'the latest migration ships the schema body of protect_data_contribution_settings');
assert(migration.includes('FUNCTION public.protect_data_contribution_settings()'), 'this migration redefines protect_data_contribution_settings');
const presetsSql = normalize(await read('../schemas/public/tables/presets.sql'));
assert(presetsSql.includes('WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) AND public.is_workspace_member(workspace_id)));'),
  'the presets update policy requires membership of the new workspace');
const oauthSql = normalize(await read('../schemas/public/tables/oauth_app_metadata.sql'));
assert(oauthSql.includes('GRANT SELECT ON TABLE "public"."oauth_app_metadata" TO "authenticated";'), 'members only read OAuth app metadata');
for (const table of ['oauth_app_metadata', 'presets', 'workspace_settings', 'keys', 'workspace_members']) {
  const sql = normalize(await read(`../schemas/public/tables/${table}.sql`));
  assert(!/TO "anon", "authenticated"/.test(sql) && !/TRUNCATE[^;]*TO "(anon|authenticated)"/.test(sql),
    `${table} grants no TRUNCATE to anon or authenticated`);
}

const db = new PGlite();
const owner = '10000000-0000-4000-8000-000000000001';
const attacker = '10000000-0000-4000-8000-000000000002';
const victimWs = '20000000-0000-4000-8000-000000000001';
const attackerWs = '20000000-0000-4000-8000-000000000002';

async function as(user, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
}
async function rejects(promise, pattern, message) {
  await assert.rejects(promise, (error) => pattern.test(String(error?.message ?? error)), message);
}

try {
  await db.exec(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
    end $$;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;

    create table public.workspaces (id uuid primary key);
    create table public.workspace_members (workspace_id uuid, user_id uuid, role text, primary key (workspace_id, user_id));
    create table public.keys (id uuid primary key default gen_random_uuid(), workspace_id uuid);
    create function public.is_workspace_member(p_team_id uuid) returns boolean language sql stable security definer set search_path = ''
      as $$ select exists (select 1 from public.workspace_members m where m.workspace_id = p_team_id and m.user_id = auth.uid()) $$;
    grant execute on function public.is_workspace_member(uuid) to authenticated;

    create table public.oauth_app_metadata (
      id uuid primary key default gen_random_uuid(), client_id text unique not null, workspace_id uuid not null,
      name text not null, created_by uuid, redirect_uris text[] not null default '{}', allowed_scopes text[] not null default '{}',
      client_type text not null default 'public', is_first_party boolean not null default false);
    alter table public.oauth_app_metadata enable row level security;
    create policy oauth_app_metadata_insert_own_team on public.oauth_app_metadata for insert to authenticated
      with check ((public.is_workspace_member(workspace_id) and (created_by = (select auth.uid() as uid))));
    create policy oauth_app_metadata_select_own_team on public.oauth_app_metadata for select to authenticated
      using (public.is_workspace_member(workspace_id));
    create policy oauth_app_metadata_update_own_team on public.oauth_app_metadata for update to authenticated
      using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

    create table public.presets (id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
      created_by uuid, slug text, visibility text not null default 'private');
    alter table public.presets enable row level security;
    create policy presets_select_visible on public.presets for select to authenticated
      using (((visibility = 'public') or (created_by = (select auth.uid() as uid)) or ((visibility = 'team') and public.is_workspace_member(workspace_id))));
    create policy presets_update_owned on public.presets for update to authenticated
      using ((created_by = (select auth.uid() as uid))) with check ((created_by = (select auth.uid() as uid)));

    create table public.workspace_settings (
      workspace_id uuid primary key, io_logging_enabled boolean not null default false,
      io_logging_retention_days integer not null default 90,
      data_contribution_enabled boolean not null default false, data_contribution_policy_version text,
      data_contribution_consented_at timestamptz, data_contribution_consented_by uuid,
      data_contribution_sample_rate_bps integer not null default 10000,
      data_contribution_classifier_sample_rate_bps integer not null default 1000,
      data_contribution_discount_bps integer not null default 100,
      io_logging_billing_status text not null default 'active', io_logging_grace_until timestamptz,
      io_logging_last_billed_at timestamptz, io_logging_last_billing_warning_at timestamptz,
      io_logging_last_billing_warning_kind text, io_logging_price_per_million_units_nanos bigint not null default 0);
    alter table public.workspace_settings enable row level security;
    create policy workspace_settings_admin on public.workspace_settings for all to authenticated
      using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
    create function public.protect_data_contribution_settings() returns trigger language plpgsql as $$ begin return new; end $$;
    create trigger protect_data_contribution_settings before insert or update on public.workspace_settings
      for each row execute function public.protect_data_contribution_settings();

    -- Production's grants before the fix.
    grant delete, insert, maintain, references, select, trigger, truncate, update
      on public.oauth_app_metadata, public.presets, public.workspace_settings, public.keys, public.workspace_members
      to anon, authenticated, service_role;

    insert into public.workspaces values ('${victimWs}'), ('${attackerWs}');
    insert into public.workspace_members values ('${victimWs}', '${owner}', 'owner'), ('${attackerWs}', '${attacker}', 'owner'),
      ('${victimWs}', '${attacker}', 'member');
    insert into public.oauth_app_metadata (client_id, workspace_id, name, created_by, redirect_uris)
      values ('team-app', '${victimWs}', 'Team app', '${owner}', array['https://team.example/cb']);
    insert into public.presets (id, workspace_id, created_by, slug) values
      ('30000000-0000-4000-8000-000000000001', '${attackerWs}', '${attacker}', 'mine'),
      ('30000000-0000-4000-8000-000000000002', '${victimWs}', '${attacker}', 'old-team');
    insert into public.workspace_settings (workspace_id, io_logging_billing_status, io_logging_grace_until)
      values ('${attackerWs}', 'suspended', now() + interval '3 days');
  `);

  // Before the fix: a creator can move a preset into a workspace they don't belong to, and a member can
  // register a first-party app.
  const strangerWs = '20000000-0000-4000-8000-000000000003';
  await as(attacker, () => db.query(`update public.presets set workspace_id = $1 where id = '30000000-0000-4000-8000-000000000001'`, [strangerWs]));
  assert.equal((await db.query(`select workspace_id from public.presets where id = '30000000-0000-4000-8000-000000000001'`)).rows[0].workspace_id, strangerWs,
    'before the fix a creator can move a preset into another workspace');
  await as(attacker, () => db.query(`insert into public.oauth_app_metadata (client_id, workspace_id, name, created_by, is_first_party)
    values ('pre-fix', $1, 'Phaseo', $2, true)`, [attackerWs, attacker]));
  await db.query(`delete from public.oauth_app_metadata where client_id = 'pre-fix'`);
  await db.query(`update public.presets set workspace_id = $1 where id = '30000000-0000-4000-8000-000000000001'`, [attackerWs]);

  await db.exec(migration);

  // 1. OAuth app metadata is read-only for members.
  await as(attacker, async () => {
    assert.equal((await db.query(`select client_id from public.oauth_app_metadata`)).rows.length, 1, 'members still read their workspace apps');
    await rejects(db.query(`insert into public.oauth_app_metadata (client_id, workspace_id, name, created_by, is_first_party, redirect_uris)
      values ('fake', $1, 'Phaseo', $2, true, array['https://evil.example/cb'])`, [attackerWs, attacker]), /permission denied/,
      'a member cannot register a first-party app');
    await rejects(db.query(`update public.oauth_app_metadata set redirect_uris = array['https://evil.example/cb'] where client_id = 'team-app'`),
      /permission denied/, 'a member cannot change a team app redirect URIs');
    await rejects(db.query(`delete from public.oauth_app_metadata where client_id = 'team-app'`), /permission denied/, 'a member cannot delete apps');
  });
  await db.exec(`set role service_role;`);
  await db.query(`update public.oauth_app_metadata set redirect_uris = array['https://team.example/cb2'] where client_id = 'team-app'`);
  await db.exec(`reset role;`);

  // 2. Presets stay inside workspaces the creator belongs to.
  // The attacker was a member of the victim workspace (so they could read its OAuth apps above). Remove
  // that membership to model an outsider, and a removed member.
  await db.query(`delete from public.workspace_members where workspace_id = $1 and user_id = $2`, [victimWs, attacker]);
  await as(attacker, async () => {
    await rejects(db.query(`update public.presets set workspace_id = $1 where id = '30000000-0000-4000-8000-000000000001'`, [victimWs]),
      /row-level security/, 'a creator cannot move a preset into a workspace they are not a member of');
    await db.query(`update public.presets set slug = 'renamed' where id = '30000000-0000-4000-8000-000000000001'`);
    const removed = await db.query(`update public.presets set slug = 'hijack' where id = '30000000-0000-4000-8000-000000000002' returning id`);
    assert.equal(removed.rows.length, 0, 'a removed member can no longer edit presets left in the old workspace');
  });
  const presets = (await db.query(`select id, workspace_id, slug from public.presets order by id`)).rows;
  assert.deepEqual(presets.map((row) => [row.workspace_id, row.slug]), [[attackerWs, 'renamed'], [victimWs, 'old-team']]);

  // 3. Extended-log billing state is platform controlled; ordinary settings still work.
  await as(attacker, async () => {
    for (const [column, value] of [
      ['io_logging_price_per_million_units_nanos', 1],
      ['io_logging_billing_status', 'active'],
      ['io_logging_grace_until', null],
      ['io_logging_last_billed_at', '2099-01-01T00:00:00Z'],
    ]) {
      await rejects(db.query(`update public.workspace_settings set ${column} = $1 where workspace_id = $2`, [value, attackerWs]),
        /extended log billing settings are platform controlled/, `an admin cannot set ${column}`);
    }
    await db.query(`update public.workspace_settings set io_logging_enabled = true, io_logging_retention_days = 180 where workspace_id = $1`, [attackerWs]);
    await rejects(db.query(`insert into public.workspace_settings (workspace_id, io_logging_price_per_million_units_nanos) values ($1, 1)`, [victimWs]),
      /platform controlled|row-level security/, 'a client cannot insert a discounted row');
  });
  const settings = (await db.query(`select * from public.workspace_settings where workspace_id = $1`, [attackerWs])).rows[0];
  assert.equal(settings.io_logging_billing_status, 'suspended');
  assert.equal(settings.io_logging_enabled, true);
  assert.equal(settings.io_logging_retention_days, 180);
  await db.query(`update public.workspace_settings set io_logging_billing_status = 'active', io_logging_grace_until = null where workspace_id = $1`, [attackerWs]);

  // 4. TRUNCATE and friends are gone for API roles, kept for service_role.
  for (const table of ['oauth_app_metadata', 'presets', 'workspace_settings', 'keys', 'workspace_members']) {
    for (const role of ['anon', 'authenticated']) {
      for (const privilege of ['TRUNCATE', 'TRIGGER', 'MAINTAIN', 'REFERENCES']) {
        const { rows } = await db.query(`select has_table_privilege($1, $2, $3) as ok`, [role, `public.${table}`, privilege]);
        assert.equal(rows[0].ok, false, `${role} has no ${privilege} on ${table}`);
      }
    }
    const { rows } = await db.query(`select has_table_privilege('service_role', $1, 'TRUNCATE') as ok`, [`public.${table}`]);
    assert.equal(rows[0].ok, true, `service_role keeps TRUNCATE on ${table}`);
  }
  for (const table of ['presets', 'workspace_settings', 'keys', 'workspace_members']) {
    // A comma-separated list is true when any one privilege is held, so check each.
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      const { rows } = await db.query(`select has_table_privilege('authenticated', $1, $2) as ok`, [`public.${table}`, privilege]);
      assert.equal(rows[0].ok, true, `authenticated keeps ${privilege} on ${table} (RLS still decides rows)`);
    }
  }

  console.log('client-writable-security-columns: all checks passed');
} finally {
  await db.close();
}
