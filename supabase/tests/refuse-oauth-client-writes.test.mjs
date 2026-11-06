// Standalone PostgreSQL regression test for OAuth client writes through the Data API (2026-11-06 review).
// Tokens the auth provider's OAuth server issues carry the app's client_id; the CLI and desktop app use public
// client IDs. Such a token could write logging, guardrails, dynamic routing, broadcast destinations, auto
// top-up and BYOK metadata through /rest/v1 as the person. The fix refuses writes from a client_id token by default:
// - every public table where authenticated holds a write grant has restrictive INSERT, UPDATE and DELETE
//   policies backed by public.request_is_oauth_client(), unless it is listed in ordinaryTables (none are);
// - every SECURITY DEFINER function signed-in users can call is classified: it refuses such a token, or it is
//   listed as ordinary with the reason.
// The table and function lists come from the declarative schema files, so a new writable table or callable
// definer function fails here until someone decides about it. The PGlite part shows the writes succeeding
// on the old policies, then refused after the real migration, while the person's own session, reads and
// service_role are unaffected.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/refuse-oauth-client-writes.test.mjs
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8').then((text) => text.replace(/\r\n/g, '\n').trim());
const migrationName = (await readdir(new URL('../migrations/', import.meta.url))).find((name) => name.endsWith('_refuse_oauth_client_writes.sql'));
assert(migrationName, 'the migration exists');
const migration = await read(`../migrations/${migrationName}`);
const helperSql = await read('../schemas/public/functions/request_is_oauth_client.sql');
assert(migration.includes(helperSql), 'the migration ships request_is_oauth_client.sql verbatim');
assert(/REVOKE ALL ON FUNCTION "public"\."request_is_oauth_client"\(\) FROM PUBLIC, "anon";/.test(helperSql), 'anon cannot call the helper');
const manifest = JSON.parse(await read('../schemas/.pgdelta-export.json'));
for (const list of ['loadOrder', 'files']) {
  assert(manifest[list].includes('public/functions/request_is_oauth_client.sql'), `the helper is in the pgdelta ${list}`);
}
const statements = (sql) => sql.split(';').map((statement) => statement.replace(/\s+/g, ' ').trim());

// 1. Tables. Tables a client_id token may still write through the Data API, with the reason. Keep it empty
// unless a table is genuinely personal and harmless; the apps write with the service role.
const ordinaryTables = new Map();
const expr = '(NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))';
const policiesFor = (table) => [
  `CREATE POLICY "${table}_no_oauth_client_insert" ON "public"."${table}"\n  AS RESTRICTIVE\n  FOR INSERT\n  TO "authenticated"\n  WITH CHECK ${expr};`,
  `CREATE POLICY "${table}_no_oauth_client_update" ON "public"."${table}"\n  AS RESTRICTIVE\n  FOR UPDATE\n  TO "authenticated"\n  USING ${expr}\n  WITH CHECK ${expr};`,
  `CREATE POLICY "${table}_no_oauth_client_delete" ON "public"."${table}"\n  AS RESTRICTIVE\n  FOR DELETE\n  TO "authenticated"\n  USING ${expr};`,
];
const tableDir = new URL('../schemas/public/tables/', import.meta.url);
const writableTables = [];
const policyTables = [];
for (const file of (await readdir(tableDir)).filter((name) => name.endsWith('.sql') && !name.endsWith('.fk.sql')).sort()) {
  const table = file.replace(/\.sql$/, '');
  const sql = (await readFile(new URL(file, tableDir), 'utf8')).replace(/\r\n/g, '\n');
  // Table-level or column-level INSERT, UPDATE or DELETE for authenticated (or PUBLIC, which includes it).
  const writable = statements(sql).some((statement) => /^GRANT /.test(statement)
    && /\b(INSERT|UPDATE|DELETE)\b/.test(statement.split(' ON TABLE ')[0])
    && /TO .*("authenticated"|PUBLIC)/.test(statement.split(' ON TABLE ')[1] ?? ''));
  const hasPolicies = sql.includes(`"${table}_no_oauth_client_`);
  if (writable) writableTables.push(table);
  if (writable && ordinaryTables.has(table)) continue;
  if (!writable && !hasPolicies) continue;
  policyTables.push(table);
  assert(/ENABLE ROW LEVEL SECURITY/.test(sql), `${table} has RLS enabled`);
  for (const policy of policiesFor(table)) {
    assert(sql.includes(policy), `${table} has authenticated write grants: it needs the OAuth client policies or a listed reason\n${policy}`);
    assert(migration.includes(policy), `the migration adds ${policy.split('"')[1]}`);
  }
}
for (const table of ordinaryTables.keys()) assert(writableTables.includes(table), `${table} is listed as ordinary but isn't writable`);
assert(writableTables.length >= 60, `found the writable tables (${writableTables.length})`);
const migrationTables = [...new Set([...migration.matchAll(/CREATE POLICY "[^"]+" ON "public"\."([^"]+)"/g)].map(([, table]) => table))];
assert.deepEqual(migrationTables.sort(), [...policyTables].sort(), 'the migration covers exactly the tables with the policies');

// 2. SECURITY DEFINER functions bypass RLS. The ones signed-in users can call either refuse a client_id token
// (membership, authority, billing and destinations) or are listed here as ordinary, with the reason.
const oauthCheck = `  -- A token issued to an OAuth client (the CLI and desktop app too) cannot change membership.
  if public.request_is_oauth_client() then
    raise exception using errcode = '42501', message = 'oauth_client_refused';
  end if;

`;
const refusingRpcs = ['approve_workspace_join_request', 'reject_workspace_join_request'];
const ordinaryRpcs = new Map([
  ['catalog_model_is_public', 'public catalogue check, read-only'],
  ['is_public_api_app', 'public app check, read-only'],
  ['is_active_invite_for_workspace', 'RLS policy helper, read-only'],
  ['is_team_owner', 'RLS policy helper, read-only'],
  ['is_workspace_admin', 'RLS policy helper, read-only'],
  ['is_workspace_member', 'RLS policy helper, read-only'],
  ['mfa_satisfied', 'MFA check, read-only'],
  ['get_workspace_key_usage', 'reads key usage'],
  ['monthly_spend_prev_cents', 'reads spend'],
  ['mtd_spend_cents', 'reads spend'],
  ['redeem_credit_code', 'adds a promotional credit; web-api allows redeeming with these tokens too'],
  ['reserve_provider_onboarding_submission_slot', "rate-limit counter for the caller's own submissions"],
]);
const rpcSql = {};
for (const schema of ['public', 'private']) {
  const dir = new URL(`../schemas/${schema}/functions/`, import.meta.url);
  for (const file of await readdir(dir).catch(() => [])) {
    const sql = (await readFile(new URL(file, dir), 'utf8')).replace(/\r\n/g, '\n');
    const name = file.replace(/\.sql$/, '');
    const create = sql.slice(0, sql.indexOf('$function$;', sql.indexOf('AS $function$') + 13) + 11);
    if (!/^\s*SECURITY DEFINER$/m.test(create)) continue;
    const callable = statements(sql).some((statement) => /^GRANT EXECUTE /.test(statement) && / TO .*("authenticated"|"anon"|PUBLIC)/.test(statement));
    if (!callable) continue;
    if (refusingRpcs.includes(name)) {
      rpcSql[name] = create;
      assert(create.includes(oauthCheck), `${name} refuses OAuth client tokens`);
      assert(migration.includes(create), `the migration ships the schema definition of ${name}`);
    } else {
      assert(ordinaryRpcs.has(name), `${schema}.${name} is a SECURITY DEFINER function signed-in users can call: make it refuse OAuth client tokens or list it as ordinary`);
    }
  }
}
assert.deepEqual(Object.keys(rpcSql).sort(), refusingRpcs, 'every refusing RPC was found');

// 3. Behaviour.
const db = new PGlite();
const owner = '10000000-0000-4000-8000-000000000001';
const requester = '10000000-0000-4000-8000-000000000002';
const ws = '20000000-0000-4000-8000-000000000001';
const session = { sub: owner, role: 'authenticated', aal: 'aal2' };
const cliToken = { ...session, client_id: 'phaseo_cli' };
const desktopToken = { ...session, client_id: 'phaseo_desktop' };
const appToken = { ...session, client_id: 'acme_reporting_app' };
async function as(claims, fn) {
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify(claims)]);
  await db.exec('set role authenticated;');
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`); }
}
async function rejects(promise, pattern, message) {
  await assert.rejects(promise, (error) => pattern.test(String(error?.message ?? error)), message);
}
// Every table the migration names exists as a stub that any signed-in user may write, like the old client
// policies on the workspace's own rows; the membership tables have the columns the RPCs use.
const realTables = new Set(['workspace_members', 'workspace_join_requests', 'workspace_invites']);
const stubTables = migrationTables.filter((table) => !realTables.has(table));

try {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on all functions in schema auth to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;
    create function public.mfa_satisfied() returns boolean language sql stable as $$ select true $$;
    create type public.workspace_role as enum ('owner', 'admin', 'member');
    create type public.join_request_status as enum ('pending', 'approved', 'denied', 'cancelled');
    create table public.workspace_members (workspace_id uuid, user_id uuid, role public.workspace_role, note text,
      constraint workspace_members_pkey primary key (workspace_id, user_id));
    create function public.is_workspace_admin(p uuid) returns boolean language sql stable security definer set search_path = ''
      as $$ select exists (select 1 from public.workspace_members m where m.workspace_id = p and m.user_id = auth.uid() and m.role in ('owner', 'admin')) $$;
    grant execute on function public.mfa_satisfied(), public.is_workspace_admin(uuid) to authenticated;
    create table public.workspace_invites (id uuid primary key default gen_random_uuid(), workspace_id uuid, role public.workspace_role,
      expires_at timestamptz, max_uses integer, uses_count integer not null default 0, note text);
    create table public.workspace_join_requests (id uuid primary key default gen_random_uuid(), workspace_id uuid not null, invite_id uuid,
      requester_user_id uuid not null, decided_by uuid, decided_at timestamptz, status public.join_request_status not null default 'pending', note text);
  `);
  for (const table of stubTables) await db.exec(`create table public.${table} (id uuid primary key default gen_random_uuid(), note text);`);
  for (const table of migrationTables) {
    await db.exec(`alter table public.${table} enable row level security;
      create policy ${table}_client_all on public.${table} for all to authenticated using (true) with check (true);
      grant select, insert, update, delete on public.${table} to authenticated, service_role;`);
  }
  await db.exec(`insert into public.workspace_members values ('${ws}', '${owner}', 'owner', null);`);
  for (const table of stubTables) await db.exec(`insert into public.${table} (note) values ('seed');`);
  // The RPCs as production has them before the fix.
  for (const name of refusingRpcs) await db.exec(rpcSql[name].replace(oauthCheck, ''));
  const joinRequest = async () => (await db.query(
    `insert into public.workspace_join_requests (workspace_id, requester_user_id) values ($1, $2) returning id`, [ws, requester])).rows[0].id;
  const requesterIsMember = async () => (await db.query(
    `select 1 from public.workspace_members where workspace_id = $1 and user_id = $2`, [ws, requester])).rows.length === 1;

  // Before: a CLI token writes every table and approves a join request.
  await db.exec('begin');
  await as(cliToken, async () => {
    for (const table of stubTables) {
      assert.equal((await db.query(`insert into public.${table} (note) values ('cli') returning id`)).rows.length, 1, `before the fix a CLI token inserts into ${table}`);
      assert.equal((await db.query(`update public.${table} set note = 'cli' returning id`)).rows.length, 2, `before the fix a CLI token updates ${table}`);
    }
  });
  const before = await joinRequest();
  await as(cliToken, async () => {
    assert.equal((await db.query(`select * from public.approve_workspace_join_request($1)`, [before])).rows.length, 1, 'before the fix a CLI token approves a join request');
  });
  assert(await requesterIsMember(), 'before the fix the approval added the requester');
  await db.exec('rollback');

  await db.exec(migration);

  // After: every client_id token is refused on every table, and reads still work.
  for (const token of [cliToken, desktopToken, appToken]) {
    await as(token, async () => {
      assert.equal((await db.query('select public.request_is_oauth_client() as v')).rows[0].v, true);
      for (const table of stubTables) {
        await rejects(db.query(`insert into public.${table} (note) values ('app')`), /row-level security/, `${token.client_id} can't insert into ${table}`);
        assert.equal((await db.query(`update public.${table} set note = 'app' returning id`)).rows.length, 0, `${token.client_id} can't update ${table}`);
        assert.equal((await db.query(`delete from public.${table} returning id`)).rows.length, 0, `${token.client_id} can't delete from ${table}`);
        assert.equal((await db.query(`select id from public.${table}`)).rows.length, 1, `${token.client_id} still reads ${table}`);
      }
      await rejects(db.query(`insert into public.workspace_members values ($1, $2, 'owner', null)`, [ws, requester]), /row-level security/,
        `${token.client_id} can't add a member directly`);
    });
  }
  const request = await joinRequest();
  for (const token of [cliToken, desktopToken, appToken]) {
    await as(token, async () => {
      await rejects(db.query(`select * from public.approve_workspace_join_request($1)`, [request]), /oauth_client_refused/, `${token.client_id} can't approve a join request`);
      await rejects(db.query(`select * from public.reject_workspace_join_request($1)`, [request]), /oauth_client_refused/, `${token.client_id} can't reject one`);
    });
  }
  assert(!(await requesterIsMember()), 'the refused approvals added nobody');

  // The person's own session (no client_id) works as before, on tables and RPCs.
  await as(session, async () => {
    assert.equal((await db.query('select public.request_is_oauth_client() as v')).rows[0].v, false);
    for (const table of stubTables) {
      assert.equal((await db.query(`insert into public.${table} (note) values ('mine') returning id`)).rows.length, 1, `the session inserts into ${table}`);
      assert.equal((await db.query(`update public.${table} set note = 'mine' returning id`)).rows.length, 2, `the session updates ${table}`);
      assert.equal((await db.query(`delete from public.${table} where note = 'mine' returning id`)).rows.length, 2, `the session deletes from ${table}`);
    }
    assert.equal((await db.query(`select * from public.approve_workspace_join_request($1)`, [request])).rows.length, 1, 'the session approves a join request');
  });
  assert(await requesterIsMember(), 'the approval added the requester');

  // service_role is unaffected; anon can't call the helper.
  await db.exec('set role service_role;');
  for (const table of stubTables) await db.query(`update public.${table} set note = 'service'`);
  await db.exec('reset role; set role anon;');
  await rejects(db.query('select public.request_is_oauth_client()'), /permission denied/, 'anon cannot call request_is_oauth_client');
  await db.exec('reset role;');

  const { rows } = await db.query(`select tablename, cmd, permissive, roles::text[] as roles from pg_policies where policyname like '%\\_no\\_oauth\\_client\\_%'`);
  assert.equal(rows.length, migrationTables.length * 3, 'three policies per table');
  for (const row of rows) {
    assert.equal(row.permissive, 'RESTRICTIVE');
    assert.deepEqual(row.roles, ['authenticated']);
    assert(['INSERT', 'UPDATE', 'DELETE'].includes(row.cmd));
  }

  console.log(`refuse-oauth-client-writes: all checks passed (${migrationTables.length} tables, ${writableTables.length} writable, ${ordinaryTables.size} ordinary; ${refusingRpcs.length} refusing and ${ordinaryRpcs.size} ordinary definer functions)`);
} finally {
  await db.close();
}
