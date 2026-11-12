// Standalone PostgreSQL test for find_member_visible_preset: the dashboard's preset lookup returns a preset
// only if it is live, in a workspace the user belongs to or owns, and not someone else's private preset.
// Membership is checked in the database, so a user in more workspaces than a capped page still finds theirs.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/find-member-visible-preset.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();
const migrationName = (await readdir(new URL('../migrations/', import.meta.url))).find((name) => name.endsWith('_find_member_visible_preset.sql'));
assert(migrationName, 'the migration exists');
const migration = normalize(await read(`../migrations/${migrationName}`));
const declared = normalize(await read('../schemas/public/functions/find_member_visible_preset.sql'));
assert(migration.includes(declared), 'the migration creates the function exactly as declared');
const exportJson = JSON.parse(await read('../schemas/.pgdelta-export.json'));
for (const list of ['loadOrder', 'files']) assert(exportJson[list].includes('public/functions/find_member_visible_preset.sql'), `${list} lists the function`);

const uuid = (prefix, n) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const member = uuid('1', 1);
const teammate = uuid('1', 2);
const owner = uuid('1', 3);
const outsider = uuid('1', 4);
const workspace = uuid('2', 1);
const db = new PGlite();
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const find = (presetId, userId) => rows('select id from public.find_member_visible_preset($1, $2)', [presetId, userId]).then((result) => result.map((row) => row.id));

try {
  await db.exec(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
    end $$;
    create table public.workspaces (id uuid primary key, owner_user_id uuid);
    create table public.workspace_members (workspace_id uuid, user_id uuid, role text, primary key (workspace_id, user_id));
    create table public.presets (
      id uuid primary key, workspace_id uuid not null, name text not null, created_by uuid,
      visibility text not null default 'team', draft_visibility text, archived_at timestamptz);
  `);
  await db.exec(migration);

  const ids = { team: uuid('3', 1), mine: uuid('3', 2), theirs: uuid('3', 3), archived: uuid('3', 4), far: uuid('3', 5) };
  await db.exec(`
    insert into public.workspaces values ('${workspace}', '${owner}');
    insert into public.workspace_members values ('${workspace}', '${member}', 'admin'), ('${workspace}', '${teammate}', 'member');
    insert into public.presets (id, workspace_id, name, created_by, visibility, archived_at) values
      ('${ids.team}', '${workspace}', '@team', '${teammate}', 'team', null),
      ('${ids.mine}', '${workspace}', '@mine', '${member}', 'private', null),
      ('${ids.theirs}', '${workspace}', '@theirs', '${teammate}', 'private', null),
      ('${ids.archived}', '${workspace}', '@old', '${teammate}', 'team', now());
  `);

  assert.deepEqual(await find(ids.team, member), [ids.team], 'a member sees a shared preset');
  assert.deepEqual(await find(ids.mine, member), [ids.mine], 'the creator sees their private preset');
  assert.deepEqual(await find(ids.theirs, member), [], "a teammate's private preset is hidden");
  assert.deepEqual(await find(uuid('3', 99), member), [], 'a missing preset returns nothing too');
  assert.deepEqual(await find(ids.archived, member), [], 'an archived preset is not returned');
  assert.deepEqual(await find(ids.team, outsider), [], 'someone outside the workspace gets nothing');
  assert.deepEqual(await find(ids.team, owner), [ids.team], 'the owner sees it without a membership row');

  // Someone in 1,001 workspaces (more than one capped page) still finds a preset in the last one.
  await db.exec(`
    insert into public.workspaces select ('4' || lpad(n::text, 7, '0') || '-0000-4000-8000-000000000000')::uuid, null from generate_series(1, 1001) n;
    insert into public.workspace_members select ('4' || lpad(n::text, 7, '0') || '-0000-4000-8000-000000000000')::uuid, '${outsider}', 'member' from generate_series(1, 1001) n;
    insert into public.presets (id, workspace_id, name, created_by, visibility) values ('${ids.far}', '40001001-0000-4000-8000-000000000000', '@far', '${teammate}', 'team');
  `);
  assert.equal((await rows(`select count(*)::int as n from public.workspace_members where user_id = '${outsider}'`))[0].n, 1001);
  assert.deepEqual(await find(ids.far, outsider), [ids.far], 'the 1,001st workspace is found');

  // Only the service role may call it.
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(rows(`select * from public.find_member_visible_preset('${ids.team}', '${member}')`), /permission denied/, `${role} cannot call it`);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  assert.deepEqual(await find(ids.team, member), [ids.team], 'the service role can');
  await db.exec('reset role');
  console.log('find-member-visible-preset: ok');
} finally {
  await db.close();
}
