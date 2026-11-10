// Standalone PostgreSQL regression test: members could read gateway_requests.detail_metadata (web search
// queries, results and fetched URLs) directly through the Data API, and through
// get_gateway_request_observability, even when the workspace limits stored contents to owners and admins.
// It reproduces the read on the old grants, applies the real migration, and checks clients keep every
// other column while the service role keeps everything.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/gateway-requests-detail-metadata.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();
const migrations = await readdir(new URL('../migrations/', import.meta.url));
const migrationName = migrations.find((name) => name.endsWith('_gateway_requests_hide_detail_metadata.sql'));
assert(migrationName, 'the migration exists');
const migration = normalize(await read(`../migrations/${migrationName}`));

// The declarative file grants the same columns, and every gateway_requests column but detail_metadata.
const schema = normalize(await read('../schemas/public/tables/gateway_requests.sql'));
const columns = new Set([...schema.matchAll(/^ {2}"(\w+)"\s+/gm), ...schema.matchAll(/ADD COLUMN "(\w+)"/g)].map((match) => match[1]));
for (const role of ['anon', 'authenticated']) {
  const pattern = new RegExp(`GRANT SELECT \\(([^)]*)\\) ON TABLE "public"\\."gateway_requests" TO "${role}";`);
  const granted = schema.match(pattern)?.[1].split(', ').map((name) => name.replaceAll('"', ''));
  assert(granted, `the schema grants ${role} column SELECT`);
  // Plus columns a later migration adds and grants on its own (expected_cost_nanos).
  const later = [];
  for (const name of migrations.filter((file) => file > migrationName).sort()) {
    const sql = normalize(await read(`../migrations/${name}`));
    for (const match of sql.matchAll(new RegExp(`GRANT SELECT \\("(\\w+)"\\) ON TABLE "public"\\."gateway_requests" TO "${role}";`, 'g'))) later.push(match[1]);
  }
  const migrated = [...migration.match(pattern)[1].split(', ').map((name) => name.replaceAll('"', '')), ...later].sort();
  assert.deepEqual(migrated, [...granted].sort(), `the migrations grant ${role} the same columns`);
  assert.deepEqual([...columns].filter((name) => !granted.includes(name)), ['detail_metadata'], `${role} gets every column except detail_metadata`);
}
assert(!/ON TABLE "public"\."gateway_requests" TO "anon", "authenticated"/.test(schema), 'no table-wide client grant remains');

const db = new PGlite();
const member = '10000000-0000-4000-8000-000000000001';
const ws = '20000000-0000-4000-8000-000000000001';
const search = { managedSearches: [{ query: 'acquisition target' }], results: [{ url: 'https://secret.example' }] };

async function as(role, user, fn) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${user ?? ''}', false);`);
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
    grant usage on schema public to anon, authenticated, service_role;
    create table public.workspace_members (workspace_id uuid, user_id uuid);
    create function public.is_workspace_member(p uuid) returns boolean language sql stable security definer set search_path = ''
      as $$ select exists (select 1 from public.workspace_members m where m.workspace_id = p and m.user_id = auth.uid()) $$;
    grant execute on function public.is_workspace_member(uuid) to anon, authenticated;
  `);
  // Every production column, partitioned by month like production.
  const columnDefs = [...columns].map((name) => {
    if (name === 'created_at') return '"created_at" timestamptz not null default now()';
    if (name === 'workspace_id') return '"workspace_id" uuid not null';
    if (name === 'request_id') return '"request_id" text';
    if (name === 'detail_metadata') return '"detail_metadata" jsonb';
    if (name === 'id') return '"id" uuid not null default gen_random_uuid()';
    return `"${name}" text`;
  });
  await db.exec(`
    create table public.gateway_requests (${columnDefs.join(', ')}) partition by range (created_at);
    create table public.gateway_requests_default partition of public.gateway_requests default;
    alter table public.gateway_requests enable row level security;
    alter table public.gateway_requests_default enable row level security;
    create policy gateway_requests_select_own_team on public.gateway_requests for select to authenticated using (public.is_workspace_member(workspace_id));
    create policy deny_direct_client_access on public.gateway_requests_default as restrictive for all to anon, authenticated using (false) with check (false);
    revoke all on table public.gateway_requests_default from anon, authenticated;
    -- Production's parent grants before the fix.
    grant delete, insert, maintain, references, select, trigger, truncate, update on public.gateway_requests to anon, authenticated, service_role;
    -- Like production's get_gateway_request_observability: security invoker, returns the whole row.
    create function public.get_gateway_request_observability(p_workspace_id uuid, p_request_id text) returns jsonb language sql stable
      as $$ select jsonb_build_object('request', to_jsonb(r)) from public.gateway_requests r where r.workspace_id = p_workspace_id and r.request_id = p_request_id $$;
    grant execute on function public.get_gateway_request_observability(uuid, text) to anon, authenticated, service_role;
    insert into public.workspace_members values ('${ws}', '${member}');
    insert into public.gateway_requests (workspace_id, request_id, model_id, detail_metadata)
      values ('${ws}', 'req-1', 'openai/gpt-test', '${JSON.stringify({ search_observability: search, labels: { team: 'a' } })}');
  `);

  // Before the fix: a member reads the search details directly and through the function.
  await as('authenticated', member, async () => {
    const direct = (await db.query(`select detail_metadata from public.gateway_requests where request_id = 'req-1'`)).rows[0];
    assert.equal(direct.detail_metadata.search_observability.managedSearches[0].query, 'acquisition target', 'before the fix a member reads search queries directly');
    const viaFunction = (await db.query(`select public.get_gateway_request_observability('${ws}', 'req-1') as o`)).rows[0].o;
    assert(JSON.stringify(viaFunction).includes('secret.example'), 'before the fix the function returns them too');
  });

  await db.exec(migration);

  await as('authenticated', member, async () => {
    await rejects(db.query(`select detail_metadata from public.gateway_requests`), /permission denied/, 'a member cannot read detail_metadata');
    await rejects(db.query(`select * from public.gateway_requests`), /permission denied/, 'select * includes detail_metadata, so it is refused');
    await rejects(db.query(`select public.get_gateway_request_observability('${ws}', 'req-1')`), /permission denied/, 'the whole-row function is refused for clients');
    const row = (await db.query(`select request_id, model_id, cost_nanos, usage from public.gateway_requests where request_id = 'req-1'`)).rows[0];
    assert.equal(row.model_id, 'openai/gpt-test', 'members still read the other columns of their rows');
    await rejects(db.query(`update public.gateway_requests set model_id = 'x'`), /permission denied/, 'no client UPDATE');
    await rejects(db.query(`truncate public.gateway_requests`), /permission denied/, 'no client TRUNCATE');
  });
  await as('anon', null, async () => {
    await rejects(db.query(`select detail_metadata from public.gateway_requests`), /permission denied/, 'anon cannot read detail_metadata');
    assert.equal((await db.query(`select request_id from public.gateway_requests`)).rows.length, 0, 'anon still sees no rows');
  });
  // The apps read with the service role and apply the contents setting themselves.
  await as('service_role', null, async () => {
    const viaFunction = (await db.query(`select public.get_gateway_request_observability('${ws}', 'req-1') as o`)).rows[0].o;
    assert.deepEqual(viaFunction.request.detail_metadata.search_observability, search, 'the service role keeps full access');
  });

  console.log('gateway-requests-detail-metadata: all assertions passed');
} finally {
  await db.close();
}
