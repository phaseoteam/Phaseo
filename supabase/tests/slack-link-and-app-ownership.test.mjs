// Standalone PostgreSQL regression test for the 2026-11-04 access review's Slack fixes:
// - slack_link_token_uses: a link token's nonce can be recorded once, so each link works once;
//   signed-in clients can't read or write it.
// - slack_apps.verified_at: saving a company Slack app no longer reserves its Slack app id; the id is
//   unique only among verified apps, and apps that already have an installation start verified.
// Install @electric-sql/pglite@0.5.8 in a temporary directory and set PGLITE_MODULE to its
// dist/index.js file URL. Run: node supabase/tests/slack-link-and-app-ownership.test.mjs
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const normalize = (sql) => sql.replace(/\r\n/g, '\n').trim();
const migrations = await readdir(new URL('../migrations/', import.meta.url));
const migrationName = migrations.find((name) => name.endsWith('_slack_link_tokens_and_app_ownership.sql'));
assert(migrationName, 'the migration exists');
const migration = normalize(await read(`../migrations/${migrationName}`));

// The declarative files describe the same end state.
const usesSql = normalize(await read('../schemas/public/tables/slack_link_token_uses.sql'));
assert(migration.includes(usesSql), 'the migration creates slack_link_token_uses exactly as declared');
const appsSql = normalize(await read('../schemas/public/tables/slack_apps.sql'));
for (const statement of [
  'CREATE INDEX slack_apps_slack_app_id_lookup_idx ON public.slack_apps USING btree (slack_app_id);',
  'CREATE UNIQUE INDEX slack_apps_slack_app_id_idx ON public.slack_apps USING btree (slack_app_id)\n  WHERE (verified_at IS NOT NULL);',
  '"verified_at"        timestamp with time zone,',
]) assert(appsSql.includes(statement), `slack_apps.sql declares: ${statement}`);
const exportJson = JSON.parse(await read('../schemas/.pgdelta-export.json'));
for (const file of ['public/tables/slack_link_token_uses.sql', 'public/functions/slack_apps_reset_verification.sql']) {
  for (const list of ['loadOrder', 'files']) assert(exportJson[list].includes(file), `${list} lists ${file}`);
}
const resetSql = normalize(await read('../schemas/public/functions/slack_apps_reset_verification.sql'));
assert(migration.includes(resetSql), 'the migration creates slack_apps_reset_verification exactly as declared');
const resetTrigger = appsSql.match(/CREATE TRIGGER slack_apps_reset_verification\n[\s\S]*?;/)?.[0];
assert(resetTrigger && migration.includes(resetTrigger), 'the migration creates the reset trigger as declared');

const db = new PGlite();
const workspaceA = '20000000-0000-4000-8000-000000000001';
const workspaceB = '20000000-0000-4000-8000-000000000002';
const user = '10000000-0000-4000-8000-000000000001';
const installedApp = '30000000-0000-4000-8000-000000000001';
const savedApp = '30000000-0000-4000-8000-000000000002';
const installation = '40000000-0000-4000-8000-000000000001';

const rejects = (promise, pattern, message) => assert.rejects(promise, (error) => pattern.test(String(error?.message ?? error)), message);

try {
  await db.exec(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
    end $$;
    create schema auth;
    create table auth.users (id uuid primary key);
    create table public.workspaces (id uuid primary key);
    -- slack_apps and slack_installations as they were before the migration (only what it touches).
    create table public.slack_apps (
      id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
      slack_app_id text not null, client_id text not null, secrets_ciphertext text not null,
      created_at timestamptz not null default now());
    create unique index slack_apps_slack_app_id_idx on public.slack_apps using btree (slack_app_id);
    create unique index slack_apps_workspace_idx on public.slack_apps using btree (workspace_id);
    create table public.slack_installations (id uuid primary key, workspace_id uuid not null, slack_app_id uuid references public.slack_apps(id));
    insert into auth.users values ('${user}');
    insert into public.workspaces values ('${workspaceA}'), ('${workspaceB}');
    insert into public.slack_apps (id, workspace_id, slack_app_id, client_id, secrets_ciphertext, created_at)
      values ('${installedApp}', '${workspaceA}', 'A0INSTALLED', '1.1', 'x', '2026-10-01T00:00:00Z');
    insert into public.slack_installations values ('${installation}', '${workspaceA}', '${installedApp}');
  `);
  await db.exec(migration);

  // An app that was installed passed Slack's app id check then, so it starts verified.
  const installed = (await db.query(`select verified_at from public.slack_apps where id = '${installedApp}'`)).rows[0];
  assert.equal(new Date(installed.verified_at).toISOString(), '2026-10-01T00:00:00.000Z');

  // Saving the same id elsewhere no longer collides while it is unverified...
  await db.exec(`insert into public.slack_apps (id, workspace_id, slack_app_id, client_id, secrets_ciphertext) values ('${savedApp}', '${workspaceB}', 'A0INSTALLED', '2.2', 'y')`);
  // ...but only one workspace can hold it verified.
  await rejects(db.exec(`update public.slack_apps set verified_at = now() where id = '${savedApp}'`), /slack_apps_slack_app_id_idx/, 'a second verified app with the same id is refused');

  // Changing a verified row's app id or client id clears its verification, whatever wrote it.
  await db.exec(`update public.slack_apps set secrets_ciphertext = 'rotated' where id = '${installedApp}'`);
  assert.ok((await db.query(`select verified_at from public.slack_apps where id = '${installedApp}'`)).rows[0].verified_at, 'rotating secrets keeps verification');
  await db.exec(`update public.slack_apps set client_id = '9.9' where id = '${installedApp}'`);
  assert.equal((await db.query(`select verified_at from public.slack_apps where id = '${installedApp}'`)).rows[0].verified_at, null, 'a new client id clears verification');
  await db.exec(`update public.slack_apps set verified_at = now() where id = '${installedApp}'`);
  await db.exec(`update public.slack_apps set slack_app_id = 'A0SWITCHED', verified_at = verified_at where id = '${installedApp}'`);
  assert.equal((await db.query(`select verified_at from public.slack_apps where id = '${installedApp}'`)).rows[0].verified_at, null, 'a new app id clears verification even when the write keeps verified_at');
  // With the old row no longer holding the id, the other workspace's install can verify it.
  await db.exec(`update public.slack_apps set verified_at = now() where id = '${savedApp}'`);

  // A link token's nonce is recorded once.
  const use = `insert into public.slack_link_token_uses (nonce, installation_id, slack_user_id, user_id, expires_at) values ('nonce-0000000001', '${installation}', 'U0PERSON01', '${user}', now() + interval '15 minutes')`;
  await db.exec(use);
  await rejects(db.exec(use), /slack_link_token_uses_pkey/, 'the same link cannot be used twice');
  await rejects(db.exec(`insert into public.slack_link_token_uses (nonce, installation_id, slack_user_id, user_id, expires_at) values ('short', '${installation}', 'U0PERSON01', '${user}', now())`), /slack_link_token_uses_nonce_check/, 'nonces have a sane length');

  // Signed-in and anonymous clients get nothing from it; uses go when their installation does.
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await rejects(db.query('select nonce from public.slack_link_token_uses'), /permission denied/, `${role} cannot read link token uses`);
    await db.exec('reset role');
  }
  await db.exec(`delete from public.slack_installations where id = '${installation}'`);
  assert.equal((await db.query('select count(*)::int as n from public.slack_link_token_uses')).rows[0].n, 0);
  console.log('slack-link-and-app-ownership: ok');
} finally {
  await db.close();
}
