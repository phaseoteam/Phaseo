// Standalone PostgreSQL regression test for the 2026-11-03 security review: MFA could be bypassed
// through the Data API. The apps require an aal2 session from users with a verified second factor,
// but RLS didn't, so the password alone gave an aal1 token that could call /rest/v1 as the owner.
// The fix adds a RESTRICTIVE policy for authenticated on every table signed-in users can reach,
// backed by public.mfa_satisfied(). This test reproduces the aal1 writes on the old policies, applies
// the real migration, and checks:
// - aal1 is refused for a user with a verified factor (reads return nothing, writes fail),
// - aal1 is allowed for a user without a verified factor (an unverified factor doesn't count),
// - aal2 is allowed,
// - anon catalogue reads and service_role are unaffected, and anon cannot call mfa_satisfied().
// It also checks the migration ships the declarative function body and that every table definition
// with a permissive policy for signed-in users carries the MFA policy (or is a listed public table).
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/require-mfa-for-data-api.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();
const migrations = await readdir(new URL('../migrations/', import.meta.url));
const migrationName = migrations.find((name) => name.endsWith('_require_mfa_for_data_api.sql'));
assert(migrationName, 'the migration exists');
const migration = normalize(await read(`../migrations/${migrationName}`));

// The declarative files describe the same end state.
const fnSql = normalize(await read('../schemas/public/functions/mfa_satisfied.sql'));
const fnBody = fnSql.slice(fnSql.indexOf('$function$'), fnSql.lastIndexOf('$function$') + 10);
assert(fnBody.length > 20 && migration.includes(fnBody), 'the migration ships the schema body of mfa_satisfied');
assert(/REVOKE ALL ON FUNCTION "public"\."mfa_satisfied"\(\) FROM PUBLIC, "anon";/.test(fnSql), 'anon cannot call mfa_satisfied');
const manifest = JSON.parse(await read('../schemas/.pgdelta-export.json'));
for (const list of ['loadOrder', 'files']) {
  assert(manifest[list].includes('public/functions/mfa_satisfied.sql'), `mfa_satisfied.sql is in the pgdelta ${list}`);
}

const policyName = 'mfa_required_when_enrolled';
const policyFor = (table) => `CREATE POLICY "${policyName}" ON "public"."${table}"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));`;

// Public catalogue and content tables: anon reads them anyway, and signed-in users can't write them.
const publicTables = new Set([
  'public_model_task_daily', 'updates', 'v2_benchmark_results', 'v2_benchmarks', 'v2_lab_links', 'v2_labs',
  'v2_meter_definitions', 'v2_model_aliases', 'v2_model_details', 'v2_model_families', 'v2_model_links',
  'v2_model_page_notices', 'v2_model_provider_routes', 'v2_models', 'v2_pricing_sku_meters', 'v2_pricing_skus',
  'v2_provider_regions', 'v2_providers', 'v2_public_effective_pricing_daily', 'v2_public_provider_health_daily',
  'v2_public_usage_daily', 'v2_public_usage_daily_meters', 'v2_public_usage_hourly', 'v2_public_usage_hourly_meters',
  'v2_route_capabilities', 'v2_route_variants', 'v2_service_tiers', 'v2_subscription_plan_features',
  'v2_subscription_plan_models', 'v2_subscription_plans',
]);
const protectedTables = [];
const tableDir = new URL('../schemas/public/tables/', import.meta.url);
for (const file of (await readdir(tableDir)).sort()) {
  const table = file.replace(/\.sql$/, '');
  const sql = normalize(await readFile(new URL(file, tableDir), 'utf8'));
  const policies = [...sql.matchAll(/^CREATE POLICY "[^"]+" ON [^\n]*\n((?: {2}[^\n]*\n?)*)/gm)];
  const reachable = policies.some(([, body]) => !/AS RESTRICTIVE/.test(body) && /^ {2}TO [^\n]*("authenticated"|PUBLIC)/m.test(body));
  if (!reachable || publicTables.has(table)) continue;
  protectedTables.push(table);
  assert(sql.includes(policyFor(table)), `${table} requires MFA for signed-in users`);
  assert(migration.includes(policyFor(table)), `the migration adds the MFA policy to ${table}`);
}
assert(protectedTables.length >= 50, `found the signed-in tables (${protectedTables.length})`);
assert.equal((migration.match(/CREATE POLICY/g) ?? []).length, protectedTables.length, 'the migration covers exactly the signed-in tables');

const db = new PGlite();
const owner = '10000000-0000-4000-8000-000000000001'; // has a verified factor
const plain = '10000000-0000-4000-8000-000000000002'; // no verified factor (one unverified)
const attacker = '10000000-0000-4000-8000-000000000003';
const ownerWs = '20000000-0000-4000-8000-000000000001';
const plainWs = '20000000-0000-4000-8000-000000000002';

async function as(user, aal, fn) {
  const claims = JSON.stringify({ sub: user, role: 'authenticated', aal });
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);
  await db.exec('set role authenticated;');
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`); }
}
async function rejects(promise, pattern, message) {
  await assert.rejects(promise, (error) => pattern.test(String(error?.message ?? error)), message);
}
const inviteSql = `insert into public.workspace_invites (workspace_id, email, role) values ($1, 'attacker@example.com', 'owner') returning id`;

try {
  await db.exec(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
    end $$;
    create schema auth;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim', true), ''), nullif(current_setting('request.jwt.claims', true), ''))::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.jwt(), auth.uid() to anon, authenticated, service_role;
    create type auth.factor_status as enum ('unverified', 'verified');
    create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid not null, status auth.factor_status not null);
    -- Supabase's default privileges let API roles execute new public functions.
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;

    create table public.workspaces (id uuid primary key, owner_user_id uuid not null, name text);
    create table public.workspace_members (workspace_id uuid, user_id uuid, role text, primary key (workspace_id, user_id));
    create function public.is_workspace_admin(p uuid) returns boolean language sql stable security definer set search_path = ''
      as $$ select exists (select 1 from public.workspace_members m where m.workspace_id = p and m.user_id = auth.uid() and m.role in ('owner', 'admin')) $$;
    create function public.is_workspace_member(p uuid) returns boolean language sql stable security definer set search_path = ''
      as $$ select exists (select 1 from public.workspace_members m where m.workspace_id = p and m.user_id = auth.uid()) $$;
    grant execute on function public.is_workspace_admin(uuid), public.is_workspace_member(uuid) to authenticated;
    create table public.workspace_invites (id uuid primary key default gen_random_uuid(), workspace_id uuid not null, email text, role text);
    create table public.keys (id uuid primary key default gen_random_uuid(), workspace_id uuid not null, status text not null default 'active');
    create table public.v2_models (model_slug text primary key);

    alter table public.workspaces enable row level security;
    alter table public.workspace_members enable row level security;
    alter table public.workspace_invites enable row level security;
    alter table public.keys enable row level security;
    alter table public.v2_models enable row level security;
    -- Production's permissive policies before the fix (they never look at aal).
    create policy "teams: select if member" on public.workspaces for select to authenticated using (public.is_workspace_member(id));
    create policy "teams: delete if owner" on public.workspaces for delete to authenticated using (owner_user_id = (select auth.uid()));
    create policy members_select on public.workspace_members for select to authenticated using (public.is_workspace_member(workspace_id));
    create policy invites_insert on public.workspace_invites for insert to authenticated with check (public.is_workspace_admin(workspace_id));
    create policy invites_select on public.workspace_invites for select to authenticated using (public.is_workspace_admin(workspace_id));
    create policy keys_select_own_team on public.keys for select to authenticated using (public.is_workspace_member(workspace_id));
    create policy keys_update_own_team on public.keys for update to authenticated
      using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));
    create policy v2_models_public_select on public.v2_models for select to anon, authenticated using (true);
    grant select, insert, update, delete on public.workspaces, public.workspace_members, public.workspace_invites, public.keys, public.v2_models
      to anon, authenticated, service_role;

    insert into auth.mfa_factors (user_id, status) values ('${owner}', 'verified'), ('${plain}', 'unverified');
    insert into public.workspaces values ('${ownerWs}', '${owner}', 'Owner'), ('${plainWs}', '${plain}', 'Plain');
    insert into public.workspace_members values ('${ownerWs}', '${owner}', 'owner'), ('${plainWs}', '${plain}', 'owner');
    insert into public.keys (workspace_id) values ('${ownerWs}'), ('${plainWs}');
    insert into public.v2_models values ('public-model');
  `);
  // The migration touches every signed-in table; the ones this test doesn't exercise exist as stubs.
  const fixtureTables = new Set(['workspaces', 'workspace_members', 'workspace_invites', 'keys']);
  for (const table of protectedTables.filter((t) => !fixtureTables.has(t))) {
    await db.exec(`create table public.${table} (id uuid primary key default gen_random_uuid()); alter table public.${table} enable row level security;`);
  }

  // Before the fix: the owner's password alone (an aal1 token) can invite someone and change keys.
  await as(owner, 'aal1', async () => {
    assert.equal((await db.query(inviteSql, [ownerWs])).rows.length, 1, 'before the fix an aal1 session of an MFA user can invite');
    assert.equal((await db.query(`update public.keys set status = 'disabled' where workspace_id = $1 returning id`, [ownerWs])).rows.length, 1,
      'before the fix an aal1 session of an MFA user can change keys');
  });
  await db.exec(`delete from public.workspace_invites; update public.keys set status = 'active';`);

  await db.exec(migration);

  // 1. A user with a verified factor and an aal1 session gets nothing.
  await as(owner, 'aal1', async () => {
    await rejects(db.query(inviteSql, [ownerWs]), /row-level security/, 'aal1 cannot invite for an MFA user');
    assert.equal((await db.query(`update public.keys set status = 'disabled' where workspace_id = $1 returning id`, [ownerWs])).rows.length, 0,
      'aal1 cannot change keys for an MFA user');
    assert.equal((await db.query(`delete from public.workspaces where id = $1 returning id`, [ownerWs])).rows.length, 0,
      'aal1 cannot delete the workspace');
    assert.equal((await db.query(`select id from public.keys`)).rows.length, 0, 'aal1 reads no keys');
    assert.equal((await db.query(`select 1 from public.workspace_members`)).rows.length, 0, 'aal1 reads no memberships');
    assert.equal((await db.query(`select model_slug from public.v2_models`)).rows.length, 1, 'public catalogue reads are unaffected');
    assert.equal((await db.query(`select public.mfa_satisfied() as ok`)).rows[0].ok, false);
  });
  // A missing aal claim counts as not verified.
  await as(owner, undefined, async () => {
    await rejects(db.query(inviteSql, [ownerWs]), /row-level security/, 'a token without aal cannot invite for an MFA user');
  });

  // 2. The same user with an aal2 session works as before.
  await as(owner, 'aal2', async () => {
    assert.equal((await db.query(inviteSql, [ownerWs])).rows.length, 1, 'aal2 can invite');
    assert.equal((await db.query(`update public.keys set status = 'disabled' where workspace_id = $1 returning id`, [ownerWs])).rows.length, 1, 'aal2 can change keys');
    assert.equal((await db.query(`select id from public.keys`)).rows.length, 1, 'aal2 reads its keys');
    assert.equal((await db.query(`select public.mfa_satisfied() as ok`)).rows[0].ok, true);
  });

  // 3. A user without a verified factor is unaffected at aal1.
  await as(plain, 'aal1', async () => {
    assert.equal((await db.query(inviteSql, [plainWs])).rows.length, 1, 'aal1 without MFA can invite');
    assert.equal((await db.query(`update public.keys set status = 'disabled' where workspace_id = $1 returning id`, [plainWs])).rows.length, 1, 'aal1 without MFA can change keys');
    assert.equal((await db.query(`select id from public.keys`)).rows.length, 1, 'aal1 without MFA reads its keys');
    // Still only its own workspace.
    assert.equal((await db.query(`update public.keys set status = 'revoked' where workspace_id = $1 returning id`, [ownerWs])).rows.length, 0);
  });
  await as(attacker, 'aal1', async () => {
    await rejects(db.query(inviteSql, [ownerWs]), /row-level security/, 'non-members are still refused');
  });

  // 4. anon and service_role are unaffected; anon cannot call the helper.
  await db.exec('set role anon;');
  assert.equal((await db.query(`select model_slug from public.v2_models`)).rows.length, 1, 'anon catalogue reads are unaffected');
  await rejects(db.query(`select public.mfa_satisfied()`), /permission denied/, 'anon cannot call mfa_satisfied');
  await db.exec('reset role; set role service_role;');
  assert.equal((await db.query(`select id from public.keys`)).rows.length, 2, 'service_role reads every key');
  assert.equal((await db.query(inviteSql, [ownerWs])).rows.length, 1, 'service_role writes as before');
  await db.exec('reset role;');

  // 5. Every signed-in table has the restrictive policy, for authenticated only.
  const { rows } = await db.query(`select tablename, permissive, roles::text[] as roles, cmd from pg_policies where policyname = $1`, [policyName]);
  assert.equal(rows.length, protectedTables.length);
  for (const row of rows) {
    assert.equal(row.permissive, 'RESTRICTIVE');
    assert.deepEqual(row.roles, ['authenticated']);
    assert.equal(row.cmd, 'ALL');
  }

  console.log(`require-mfa-for-data-api: all checks passed (${protectedTables.length} tables)`);
} finally {
  await db.close();
}
