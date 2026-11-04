// Standalone PostgreSQL regression test for 2026-11-03: a signed-in workspace member could read the
// BYOK ciphertext (enc_value, enc_iv, enc_tag) through PostgREST, and an admin could write the
// encryption columns directly, e.g. setting enc_aad_version back to 0 so the gateway falls back to
// unbound legacy ciphertext. The API and web-api read and write these columns with the service role.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/byok-keys-client-secret-columns.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();
const migrations = await readdir(new URL('../migrations/', import.meta.url));
const migrationName = migrations.find((name) => name.endsWith('_byok_keys_client_secret_columns.sql'));
assert(migrationName, 'the migration exists');
const migration = normalize(await read(`../migrations/${migrationName}`));

// The declarative files describe the same end state.
const tableSql = normalize(await read('../schemas/public/tables/byok_keys.sql'));
for (const line of migration.split('\n').filter((line) => /^GRANT (SELECT|INSERT|UPDATE|DELETE)/.test(line))) {
  assert(tableSql.includes(line), `byok_keys.sql has: ${line.slice(0, 60)}...`);
}
assert(!/TO "anon"/.test(tableSql) && !/TO "anon", "authenticated"/.test(tableSql), 'byok_keys.sql grants nothing to anon');
const fnSql = normalize(await read('../schemas/public/functions/reorder_v2_byok_key.sql'));
const fnBody = fnSql.slice(fnSql.indexOf('$function$'), fnSql.lastIndexOf('$function$') + 10);
assert(fnBody.length > 20 && migration.includes(fnBody), 'the migration ships the schema body of reorder_v2_byok_key');

const db = new PGlite();
const admin = '10000000-0000-4000-8000-000000000001';
const member = '10000000-0000-4000-8000-000000000002';
const ws = '20000000-0000-4000-8000-000000000001';
const keyA = '30000000-0000-4000-8000-00000000000a';
const keyB = '30000000-0000-4000-8000-00000000000b';

async function as(user, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
}
async function denied(promise, message) {
  await assert.rejects(promise, (error) => /permission denied/.test(String(error?.message ?? error)), message);
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

    create table public.workspace_members (workspace_id uuid, user_id uuid, role text, primary key (workspace_id, user_id));
    create function public.is_workspace_member(p uuid) returns boolean language sql stable security definer set search_path = ''
      as $$ select exists (select 1 from public.workspace_members m where m.workspace_id = p and m.user_id = auth.uid()) $$;
    create function public.is_workspace_admin(p uuid) returns boolean language sql stable security definer set search_path = ''
      as $$ select exists (select 1 from public.workspace_members m where m.workspace_id = p and m.user_id = auth.uid() and m.role in ('owner', 'admin')) $$;
    grant execute on function public.is_workspace_member(uuid), public.is_workspace_admin(uuid) to authenticated;

    create table public.byok_keys (
      id uuid primary key default gen_random_uuid(), workspace_id uuid not null, provider_id text not null, name text not null,
      enabled boolean not null default true, always_use boolean not null default false,
      enc_value bytea not null, enc_iv bytea not null, enc_tag bytea not null, key_version integer not null default 1,
      fingerprint_sha256 text not null, prefix text not null, suffix text not null, created_by uuid not null,
      created_at timestamptz not null default now(), last_used_at timestamptz, last_verified_at timestamptz,
      verification_status text not null default 'unknown', error_message text, routing_mode text not null default 'fallback',
      sort_order integer not null default 0, allowed_model_slugs text[], allowed_api_key_ids uuid[],
      enc_aad_version smallint not null default 0);
    alter table public.byok_keys enable row level security;
    create policy byok_keys_delete_workspace_admin on public.byok_keys for delete to authenticated using (public.is_workspace_admin(workspace_id));
    create policy byok_keys_insert_workspace_admin on public.byok_keys for insert to authenticated with check (public.is_workspace_admin(workspace_id));
    create policy byok_keys_select_workspace_member on public.byok_keys for select to authenticated using (public.is_workspace_member(workspace_id));
    create policy byok_keys_update_workspace_admin on public.byok_keys for update to authenticated
      using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));

    -- Production's grants before the fix.
    grant delete, insert, maintain, references, select, trigger, truncate, update on public.byok_keys to anon, authenticated, service_role;

    insert into public.workspace_members values ('${ws}', '${admin}', 'admin'), ('${ws}', '${member}', 'member');
    insert into public.byok_keys (id, workspace_id, provider_id, name, enc_value, enc_iv, enc_tag, fingerprint_sha256, prefix, suffix, created_by, sort_order, enc_aad_version, created_at)
      values ('${keyA}', '${ws}', 'openai', 'A', '\\x0102', '\\x0304', '\\x0506', 'fp-a', 'sk-pro', 'abcd', '${admin}', 0, 1, now() - interval '1 minute'),
             ('${keyB}', '${ws}', 'openai', 'B', '\\x0708', '\\x0910', '\\x1112', 'fp-b', 'sk-pro', 'efgh', '${admin}', 1, 1, now());
  `);

  // Before the fix: a member reads the ciphertext, and an admin downgrades the AAD binding.
  await as(member, async () => {
    const { rows } = await db.query(`select enc_value, enc_iv, enc_tag from public.byok_keys where id = $1`, [keyA]);
    assert.equal(rows.length, 1, 'before the fix a member reads the ciphertext');
  });
  await as(admin, () => db.query(`update public.byok_keys set enc_aad_version = 0, fingerprint_sha256 = 'forged' where id = $1`, [keyA]));
  assert.equal((await db.query(`select enc_aad_version from public.byok_keys where id = $1`, [keyA])).rows[0].enc_aad_version, 0,
    'before the fix an admin rewrites enc_aad_version');
  await db.query(`update public.byok_keys set enc_aad_version = 1, fingerprint_sha256 = 'fp-a' where id = $1`, [keyA]);

  // The reorder RPC as it was before (select * as the signed-in admin).
  await db.exec(`
    create function public.reorder_v2_byok_key(p_workspace_id uuid, p_key_id uuid, p_direction text) returns boolean language plpgsql set search_path to 'public' as $f$
    declare current_key public.byok_keys%rowtype; begin
      select * into current_key from public.byok_keys where id = p_key_id and workspace_id = p_workspace_id for update;
      return found; end; $f$;
    grant execute on function public.reorder_v2_byok_key(uuid, uuid, text) to authenticated;
  `);

  await db.exec(migration);

  // 1. Nobody signed in reads the ciphertext or its AAD version; the dashboard columns still read.
  for (const user of [member, admin]) {
    await as(user, async () => {
      for (const column of ['enc_value', 'enc_iv', 'enc_tag', 'enc_aad_version']) {
        await denied(db.query(`select ${column} from public.byok_keys`), `${user} cannot read ${column}`);
      }
      await denied(db.query(`select * from public.byok_keys`), 'select * no longer returns the ciphertext');
      const { rows } = await db.query(`select id, provider_id, name, prefix, suffix, fingerprint_sha256, key_version, routing_mode, sort_order,
        enabled, verification_status, allowed_model_slugs, allowed_api_key_ids from public.byok_keys order by sort_order`);
      assert.equal(rows.length, 2, 'members still list their workspace keys');
    });
  }

  // 2. Admins cannot write the encryption columns, insert or update; ordinary settings still update.
  await as(admin, async () => {
    for (const [column, value] of [
      ['enc_value', new Uint8Array([0])], ['enc_iv', new Uint8Array([0])], ['enc_tag', new Uint8Array([0])], ['enc_aad_version', 0], ['key_version', 2], ['fingerprint_sha256', 'forged'],
    ]) {
      await denied(db.query(`update public.byok_keys set ${column} = $1 where id = $2`, [value, keyA]), `an admin cannot set ${column}`);
    }
    await denied(db.query(`insert into public.byok_keys (workspace_id, provider_id, name, enc_value, enc_iv, enc_tag, fingerprint_sha256, prefix, suffix, created_by, enc_aad_version)
      values ($1, 'openai', 'C', '\\x00', '\\x00', '\\x00', 'fp-c', 'x', 'y', $2, 0)`, [ws, admin]), 'an admin cannot insert ciphertext directly');
    await db.query(`update public.byok_keys set name = 'Renamed', enabled = false, allowed_model_slugs = array['openai/gpt-5'] where id = $1`, [keyA]);

    // 3. The reorder RPC still works for the signed-in admin.
    const { rows } = await db.query(`select public.reorder_v2_byok_key($1, $2, 'up') as ok`, [ws, keyB]);
    assert.equal(rows[0].ok, true, 'the admin can still reorder keys');
  });
  const after = (await db.query(`select id, name, enabled, sort_order, enc_aad_version, fingerprint_sha256 from public.byok_keys order by id`)).rows;
  assert.deepEqual(after.map((row) => [row.name, row.enabled, row.sort_order, row.enc_aad_version, row.fingerprint_sha256]),
    [['Renamed', false, 1, 1, 'fp-a'], ['B', true, 0, 1, 'fp-b']]);

  // 4. Members (non-admins) still cannot reorder; admins can still delete under RLS.
  await as(member, async () => {
    await assert.rejects(db.query(`select public.reorder_v2_byok_key($1, $2, 'up')`, [ws, keyA]), /forbidden/, 'a member cannot reorder');
  });

  // 5. anon holds nothing, service_role keeps everything, nobody but service_role truncates.
  for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'MAINTAIN', 'REFERENCES']) {
    const anon = await db.query(`select has_table_privilege('anon', 'public.byok_keys', $1) as ok`, [privilege]);
    assert.equal(anon.rows[0].ok, false, `anon has no ${privilege}`);
    const service = await db.query(`select has_table_privilege('service_role', 'public.byok_keys', $1) as ok`, [privilege]);
    assert.equal(service.rows[0].ok, true, `service_role keeps ${privilege}`);
  }
  for (const privilege of ['TRUNCATE', 'TRIGGER', 'MAINTAIN', 'REFERENCES']) {
    const { rows } = await db.query(`select has_table_privilege('authenticated', 'public.byok_keys', $1) as ok`, [privilege]);
    assert.equal(rows[0].ok, false, `authenticated has no ${privilege}`);
  }
  await db.exec('set role service_role;');
  await db.query(`update public.byok_keys set enc_aad_version = 1, enc_value = '\\x0a0b' where id = $1`, [keyA]);
  assert.equal((await db.query(`select count(*)::int as n from public.byok_keys where enc_value is not null`)).rows[0].n, 2);
  await db.exec('reset role;');
  await as(admin, async () => {
    const { rows } = await db.query(`delete from public.byok_keys where id = $1 returning id`, [keyB]);
    assert.equal(rows.length, 1, 'an admin can still delete a key');
  });

  console.log('byok-keys-client-secret-columns: all checks passed');
} finally {
  await db.close();
}
