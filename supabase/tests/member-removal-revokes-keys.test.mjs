// Standalone PostgreSQL regression test for the 2026-11-03 security review (second pass):
// - Removing a workspace member revoked their OAuth grants but left the API keys and management keys
//   they created working. Their keys are now revoked with the membership, and signed-in clients can no
//   longer move a key's creator to someone else to dodge that.
// - Anyone could read the unpublished draft_* columns of a public preset.
// - Admins could create admin invites, or switch an invite to admin, through the Data API.
// It reproduces each problem on the old schema, applies the real migration, and checks the fix.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/member-removal-revokes-keys.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();
const migrations = await readdir(new URL('../migrations/', import.meta.url));
const migrationName = migrations.find((name) => name.endsWith('_member_removal_revokes_keys.sql'));
assert(migrationName, 'the migration exists');
const migration = normalize(await read(`../migrations/${migrationName}`));

// The declarative files describe the same end state.
const bodyOf = (sql) => sql.slice(sql.indexOf('$function$'), sql.lastIndexOf('$function$') + 10);
for (const fn of ['revoke_oauth_on_workspace_member_delete', 'protect_key_created_by', 'enforce_workspace_invite_role_policy']) {
  const body = bodyOf(normalize(await read(`../schemas/public/functions/${fn}.sql`)));
  assert(body.length > 20 && migration.includes(body), `the migration ships the schema body of ${fn}`);
}
const manifest = JSON.parse(await read('../schemas/.pgdelta-export.json'));
for (const list of [manifest.loadOrder, manifest.files]) {
  assert(list.includes('public/functions/protect_key_created_by.sql'), 'the schema manifest lists protect_key_created_by');
}
for (const table of ['keys', 'management_keys']) {
  const sql = normalize(await read(`../schemas/public/tables/${table}.sql`));
  assert(/BEFORE INSERT OR UPDATE OF created_by ON public\.\w+\n\s+FOR EACH ROW\n\s+EXECUTE FUNCTION public\.protect_key_created_by\(\);/.test(sql),
    `${table} runs protect_key_created_by`);
  assert(!/TRUNCATE[^;]*TO "(anon|authenticated)"/.test(sql), `${table} grants no TRUNCATE to anon or authenticated`);
}
const presetsSql = normalize(await read('../schemas/public/tables/presets.sql'));
assert(!/GRANT[^;]*SELECT[^;(]*ON TABLE "public"\."presets" TO "(anon|authenticated)"/.test(presetsSql), 'presets has no table-wide SELECT for clients');
assert(!/GRANT SELECT \([^)]*draft_[^)]*\) ON TABLE "public"\."presets"/.test(presetsSql), 'no client column grant includes a draft column');

const db = new PGlite();
const owner = '10000000-0000-4000-8000-000000000001';
const admin = '10000000-0000-4000-8000-000000000002';
const other = '10000000-0000-4000-8000-000000000003';
const leaver = '10000000-0000-4000-8000-000000000004';
const ws = '20000000-0000-4000-8000-000000000001';
const otherWs = '20000000-0000-4000-8000-000000000002';

async function as(role, user, fn) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${user ?? ''}', false);`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
}
async function rejects(promise, pattern, message) {
  await assert.rejects(promise, (error) => pattern.test(String(error?.message ?? error)), message);
}
const keyStatus = async (table, id) =>
  (await db.query(`select status, revoked_reason, revoked_at is not null as stamped from public.${table} where id = $1`, [id])).rows[0];

const key = (n) => `40000000-0000-4000-8000-00000000000${n}`;
const mkey = (n) => `50000000-0000-4000-8000-00000000000${n}`;
const preset = '30000000-0000-4000-8000-000000000001';

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

    create table public.users (user_id uuid primary key);
    create table public.workspaces (id uuid primary key, owner_user_id uuid);
    create table public.workspace_members (
      workspace_id uuid not null references public.workspaces(id) on delete cascade,
      user_id uuid not null references public.users(user_id) on delete cascade,
      role text not null, primary key (workspace_id, user_id));
    create function public.is_workspace_admin(p uuid) returns boolean language sql stable security definer set search_path = ''
      as $$ select exists (select 1 from public.workspace_members m where m.workspace_id = p and m.user_id = auth.uid() and m.role in ('owner', 'admin')) $$;
    grant execute on function public.is_workspace_admin(uuid) to authenticated;

    create table public.oauth_authorizations (user_id uuid, workspace_id uuid, revoked_at timestamptz);
    create table public.oauth_refresh_tokens (user_id uuid, workspace_id uuid, revoked_at timestamptz);

    create table public.keys (
      id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
      name text not null default 'key', status text not null default 'active', revoked_at timestamptz, revoked_reason text,
      created_by uuid not null default auth.uid() references public.users(user_id) on delete cascade);
    alter table public.keys enable row level security;
    create policy keys_insert_own_team on public.keys for insert to authenticated with check (public.is_workspace_admin(workspace_id));
    create policy keys_select_own_team on public.keys for select to authenticated using (public.is_workspace_admin(workspace_id));
    create policy keys_update_own_team on public.keys for update to authenticated
      using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));
    -- Production stamps revoked_at on keys with protect_revoked_key_status.
    create function public.stamp_revoked_at() returns trigger language plpgsql as $$
      begin if new.status = 'revoked' and old.status is distinct from 'revoked' then new.revoked_at := coalesce(new.revoked_at, now()); end if; return new; end $$;
    create trigger protect_revoked_key_status before update of status on public.keys for each row execute function public.stamp_revoked_at();

    create table public.management_keys (
      id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
      name text not null default 'mk', status text not null default 'active', revoked_at timestamptz, revoked_reason text,
      created_by uuid references public.users(user_id) on delete set null);
    alter table public.management_keys enable row level security;
    create policy management_keys_insert_own_team on public.management_keys for insert to authenticated with check (public.is_workspace_admin(workspace_id));
    create policy management_keys_select_own_team on public.management_keys for select to authenticated using (public.is_workspace_admin(workspace_id));
    create policy management_keys_update_own_team on public.management_keys for update to authenticated
      using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));

    -- The member-delete trigger as it was before the fix: OAuth grants only.
    create function public.revoke_oauth_on_workspace_member_delete() returns trigger language plpgsql security definer set search_path = '' as $$
    begin
      update public.oauth_authorizations set revoked_at = coalesce(revoked_at, now()) where user_id = old.user_id and workspace_id = old.workspace_id and revoked_at is null;
      update public.oauth_refresh_tokens set revoked_at = coalesce(revoked_at, now()) where user_id = old.user_id and workspace_id = old.workspace_id and revoked_at is null;
      return old;
    end $$;
    create trigger revoke_oauth_on_workspace_member_delete after delete on public.workspace_members
      for each row execute function public.revoke_oauth_on_workspace_member_delete();

    create table public.presets (
      id uuid primary key default gen_random_uuid(), workspace_id uuid not null, name text not null default 'p', description text,
      config jsonb not null default '{}', created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      visibility text not null default 'team', source_preset_id uuid, slug text not null default 'p', draft_name text, draft_slug text,
      draft_description text, draft_config jsonb, draft_visibility text, active_version_id uuid, source_preset_version_id uuid,
      upstream_version_id uuid, root_preset_id uuid, fork_depth integer not null default 0, versioning_method text not null default 'sequential',
      archived_at timestamptz);
    alter table public.presets enable row level security;
    create policy presets_select_public_anon on public.presets for select to anon using (visibility = 'public');
    create policy presets_select_visible on public.presets for select to authenticated using (visibility = 'public');
    create policy presets_update_owned on public.presets for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());

    create table public.workspace_invites (id uuid primary key default gen_random_uuid(), workspace_id uuid not null, role text not null default 'member');
    alter table public.workspace_invites enable row level security;
    create policy team_invites_insert_own_team on public.workspace_invites for insert to authenticated
      with check (public.is_workspace_admin(workspace_id) and role in ('admin', 'member'));
    create policy team_invites_update_own_team on public.workspace_invites for update to authenticated
      using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id) and role in ('admin', 'member'));
    create policy team_invites_select_own_team on public.workspace_invites for select to authenticated using (public.is_workspace_admin(workspace_id));
    -- The invite role guard as it was before the fix: admin or member, from anyone.
    create function public.enforce_workspace_invite_role_policy() returns trigger language plpgsql security definer set search_path to 'public' as $$
    begin
      if lower(coalesce(new.role::text, '')) not in ('admin', 'member') then raise exception 'invalid_workspace_invite_role'; end if;
      return new;
    end $$;
    create trigger workspace_invites_role_policy_guard before insert or update on public.workspace_invites
      for each row execute function public.enforce_workspace_invite_role_policy();
    grant select, insert, update, delete on public.workspace_invites to authenticated;

    -- Production's grants before the fix.
    grant delete, insert, maintain, references, select, trigger, truncate, update on public.management_keys to anon, authenticated, service_role;
    grant delete, insert, select, update on public.keys, public.presets to anon, authenticated;
    grant all on all tables in schema public to service_role;

    insert into public.users values ('${owner}'), ('${admin}'), ('${other}'), ('${leaver}');
    insert into public.workspaces values ('${ws}', '${owner}'), ('${otherWs}', '${admin}');
    insert into public.workspace_members values
      ('${ws}', '${owner}', 'owner'), ('${ws}', '${admin}', 'admin'), ('${ws}', '${other}', 'member'), ('${otherWs}', '${admin}', 'owner');
    insert into public.keys (id, workspace_id, created_by, status, revoked_reason) values
      ('${key(1)}', '${ws}', '${admin}', 'active', null),
      ('${key(2)}', '${ws}', '${admin}', 'paused', null),
      ('${key(3)}', '${ws}', '${admin}', 'revoked', 'rotated'),
      ('${key(4)}', '${ws}', '${owner}', 'active', null),
      ('${key(5)}', '${otherWs}', '${admin}', 'active', null),
      ('${key(6)}', '${ws}', '${leaver}', 'active', null);
    insert into public.management_keys (id, workspace_id, created_by) values
      ('${mkey(1)}', '${ws}', '${admin}'), ('${mkey(2)}', '${ws}', '${owner}'), ('${mkey(3)}', '${ws}', '${other}');
    insert into public.oauth_authorizations values ('${admin}', '${ws}', null);
    insert into public.presets (id, workspace_id, created_by, visibility, name, config, draft_name, draft_config) values
      ('${preset}', '${ws}', '${owner}', 'public', 'Published', '{"model":"a"}', 'Secret plan', '{"model":"unreleased"}');
  `);

  // Before the fix. key(6) belongs to someone who already left (their membership ended earlier).
  // An admin can pin their key on the owner, and anyone reads a public preset's draft.
  await as('authenticated', admin, () => db.query(`update public.keys set created_by = '${owner}' where id = '${key(2)}'`));
  assert.equal((await db.query(`select created_by from public.keys where id = '${key(2)}'`)).rows[0].created_by, owner,
    'before the fix an admin can move their key onto the owner');
  await db.query(`update public.keys set created_by = '${admin}' where id = '${key(2)}'`);
  const leakedDraft = await as('anon', null, () => db.query(`select draft_config from public.presets where id = '${preset}'`));
  assert.deepEqual(leakedDraft.rows[0].draft_config, { model: 'unreleased' }, 'before the fix anon reads a public preset draft');
  await db.exec('begin;');
  await db.query(`delete from public.workspace_members where workspace_id = '${ws}' and user_id = '${admin}'`);
  assert.equal((await keyStatus('keys', key(1))).status, 'active', 'before the fix a removed admin keeps an active key');
  assert.equal((await keyStatus('management_keys', mkey(1))).status, 'active', 'before the fix a removed admin keeps an active management key');
  await db.exec('rollback;');
  await db.exec('begin;');
  await as('authenticated', admin, () => db.query(`insert into public.workspace_invites (workspace_id, role) values ('${ws}', 'admin')`));
  assert.equal((await db.query(`select count(*)::int as n from public.workspace_invites where role = 'admin'`)).rows[0].n, 1,
    'before the fix an admin can create an admin invite');
  await db.exec('rollback;');

  await db.exec(migration);

  // Only the owner makes admins by invite; the service role (web-api checks the owner) is not limited.
  const memberInvite = (await db.query(`insert into public.workspace_invites (workspace_id) values ('${ws}') returning id`)).rows[0].id;
  await as('authenticated', admin, async () => {
    await rejects(db.query(`insert into public.workspace_invites (workspace_id, role) values ('${ws}', 'admin')`), /workspace_invite_admin_owner_only/, 'an admin cannot create an admin invite');
    await rejects(db.query(`update public.workspace_invites set role = 'admin' where id = '${memberInvite}'`), /workspace_invite_admin_owner_only/, 'an admin cannot switch an invite to admin');
    await db.query(`insert into public.workspace_invites (workspace_id, role) values ('${ws}', 'member')`);
    // admin owns otherWs: an admin invite made there cannot be moved into ws, where they are only an admin.
    const own = (await db.query(`insert into public.workspace_invites (workspace_id, role) values ('${otherWs}', 'admin') returning id`)).rows[0].id;
    await rejects(db.query(`update public.workspace_invites set workspace_id = '${ws}' where id = '${own}'`), /workspace_invite_admin_owner_only/, 'an admin invite cannot be moved into a workspace the caller does not own');
  });
  await as('authenticated', owner, () => db.query(`update public.workspace_invites set role = 'admin' where id = '${memberInvite}'`));
  await db.query(`insert into public.workspace_invites (workspace_id, role) values ('${ws}', 'admin')`);
  assert.equal((await db.query(`select count(*)::int as n from public.workspace_invites where role = 'admin' and workspace_id = '${ws}'`)).rows[0].n, 2,
    'the owner and the service role can still create admin invites');

  // The migration revokes keys already left behind by former members.
  assert.deepEqual(await keyStatus('keys', key(6)), { status: 'revoked', revoked_reason: 'member_removed', stamped: true },
    'a key whose creator already left is revoked by the migration');
  assert.equal((await keyStatus('keys', key(1))).status, 'active', 'current members keep their keys');

  // Removing a member revokes exactly the keys they created in that workspace.
  await db.query(`delete from public.workspace_members where workspace_id = '${ws}' and user_id = '${admin}'`);
  assert.deepEqual(await keyStatus('keys', key(1)), { status: 'revoked', revoked_reason: 'member_removed', stamped: true }, 'their active key is revoked');
  assert.deepEqual(await keyStatus('keys', key(2)), { status: 'revoked', revoked_reason: 'member_removed', stamped: true }, 'their paused key is revoked too');
  assert.deepEqual(await keyStatus('keys', key(3)), { status: 'revoked', revoked_reason: 'rotated', stamped: false }, 'an already revoked key keeps its reason');
  assert.equal((await keyStatus('keys', key(4))).status, 'active', "the owner's key is untouched");
  assert.equal((await keyStatus('keys', key(5))).status, 'active', 'their key in another workspace is untouched');
  assert.deepEqual(await keyStatus('management_keys', mkey(1)), { status: 'revoked', revoked_reason: 'member_removed', stamped: true }, 'their management key is revoked');
  assert.equal((await keyStatus('management_keys', mkey(2))).status, 'active', "the owner's management key is untouched");
  assert.equal((await db.query(`select count(*)::int as n from public.oauth_authorizations where revoked_at is null`)).rows[0].n, 0, 'OAuth grants are still revoked');

  // Signed-in clients cannot create keys in someone else's name or change a key's creator.
  await as('authenticated', owner, async () => {
    await rejects(db.query(`update public.keys set created_by = '${other}' where id = '${key(4)}'`), /key_creator_locked/, 'the creator cannot be changed');
    await rejects(db.query(`insert into public.keys (workspace_id, created_by) values ('${ws}', '${other}')`), /key_creator_locked/, 'no key in someone else\'s name');
    await rejects(db.query(`insert into public.management_keys (workspace_id, created_by) values ('${ws}', null)`), /key_creator_locked/, 'no anonymous management key');
    await db.query(`insert into public.keys (workspace_id) values ('${ws}')`);
    await db.query(`insert into public.management_keys (workspace_id, created_by) values ('${ws}', '${owner}')`);
    await db.query(`update public.keys set name = 'renamed' where id = '${key(4)}'`);
  });
  assert.equal((await db.query(`select count(*)::int as n from public.keys where created_by = '${owner}'`)).rows[0].n, 2, 'own keys can still be created');
  // The service role (API, web-api) keeps full control.
  await db.query(`update public.keys set created_by = '${other}' where id = '${key(4)}'`);
  await db.query(`update public.keys set created_by = '${owner}' where id = '${key(4)}'`);

  // A management key whose creator's account is deleted (created_by set to NULL) is revoked with it.
  await db.query(`update public.management_keys set created_by = null where id = '${mkey(3)}'`);
  assert.deepEqual(await keyStatus('management_keys', mkey(3)), { status: 'revoked', revoked_reason: 'creator_deleted', stamped: true },
    'a management key without a creator is revoked');

  // Clients lose TRUNCATE on management_keys.
  await as('authenticated', owner, () => rejects(db.query('truncate public.management_keys'), /permission denied/, 'no TRUNCATE for authenticated'));

  // Public presets: published columns stay readable; drafts do not.
  for (const [role, user] of [['anon', null], ['authenticated', other]]) {
    await as(role, user, async () => {
      const row = (await db.query(`select id, name, slug, description, config from public.presets where id = '${preset}'`)).rows[0];
      assert.deepEqual(row.config, { model: 'a' }, `${role} still reads the published preset`);
      await rejects(db.query(`select draft_config from public.presets where id = '${preset}'`), /permission denied/, `${role} cannot read draft_config`);
      await rejects(db.query(`select * from public.presets`), /permission denied/, `${role} cannot select * (drafts included)`);
    });
  }
  // Owners still edit through the client by id; the draft write works without reading it back.
  await as('authenticated', owner, () => db.query(`update public.presets set draft_name = 'Next' where id = '${preset}'`));
  assert.equal((await db.query(`select draft_name from public.presets where id = '${preset}'`)).rows[0].draft_name, 'Next');

  console.log('member-removal-revokes-keys: all assertions passed');
} finally {
  await db.close();
}
