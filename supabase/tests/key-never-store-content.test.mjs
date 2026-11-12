import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8').then((text) => text.replace(/\r\n/g, '\n').trimEnd());
const migration = await read('../migrations/20261021200356_key_never_store_content.sql');
const functionFile = await read('../schemas/public/functions/protect_key_never_store_content.sql');
const keysFile = await read('../schemas/public/tables/keys.sql');
const trigger = keysFile.match(/CREATE TRIGGER protect_key_never_store_content\n[\s\S]*?;/)?.[0];
const comment = keysFile.match(/COMMENT ON COLUMN "public"\."keys"\."never_store_content"[^\n]*/)?.[0];

// The migration must carry the declarative files exactly.
assert.ok(trigger, 'keys.sql declares the trigger');
assert.ok(comment, 'keys.sql comments the column');
assert.ok(keysFile.includes('"never_store_content"      boolean                  NOT NULL DEFAULT false'));
assert.ok(migration.includes(functionFile), 'migration includes the function file verbatim');
assert.ok(migration.includes(trigger), 'migration includes the trigger');
assert.ok(migration.includes(comment), 'migration includes the column comment');

const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.keys (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null,
      name text not null,
      status text not null default 'active'
    );
    grant select, insert, update, delete on public.keys to authenticated, service_role;
    insert into public.keys (id, workspace_id, name) values
      ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', 'existing');
  `);
  await db.exec(migration);

  const flag = async (id) => (await db.query('select never_store_content from public.keys where id = $1', [id])).rows[0].never_store_content;

  // Existing keys keep today's behaviour.
  assert.equal(await flag('00000000-0000-4000-8000-000000000001'), false);

  // A key can be created with the setting on, and turned on later.
  await db.exec(`insert into public.keys (id, workspace_id, name, never_store_content) values
    ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000aa', 'agent', true)`);
  await db.exec(`update public.keys set never_store_content = true where id = '00000000-0000-4000-8000-000000000001'`);
  assert.equal(await flag('00000000-0000-4000-8000-000000000001'), true);

  // Other edits still work on a locked key.
  await db.exec(`update public.keys set name = 'renamed', status = 'disabled' where id = '00000000-0000-4000-8000-000000000002'`);
  await db.exec(`update public.keys set never_store_content = true where id = '00000000-0000-4000-8000-000000000002'`);

  // It can never be turned off: not by workspace admins, not by the service role.
  for (const role of ['authenticated', 'service_role', 'postgres']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(
      db.exec(`update public.keys set never_store_content = false where id = '00000000-0000-4000-8000-000000000002'`),
      /key_never_store_content_locked/,
      role,
    );
    await db.exec('reset role');
  }
  assert.equal(await flag('00000000-0000-4000-8000-000000000002'), true);

  // Deleting the key is still allowed.
  await db.exec(`delete from public.keys where id = '00000000-0000-4000-8000-000000000002'`);
  assert.equal((await db.query('select count(*)::int as n from public.keys')).rows[0].n, 1);

  console.log('key-never-store-content: ok');
} finally {
  await db.close();
}
