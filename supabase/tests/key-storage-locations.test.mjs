import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8').then((text) => text.replace(/\r\n/g, '\n').trimEnd());
const migration = await read('../migrations/20261022100000_key_storage_locations.sql');
const keysFile = await read('../schemas/public/tables/keys.sql');
const functionFile = await read('../schemas/public/functions/valid_key_storage_locations.sql');
const revokedFunction = await read('../schemas/public/functions/protect_revoked_key_status.sql');
const revokedTrigger = keysFile.match(/CREATE TRIGGER protect_revoked_key_status\n[\s\S]*?;/)?.[0];
const shared = await read('../../packages/shared/key-storage-locations/index.ts');
const comment = keysFile.match(/COMMENT ON COLUMN "public"\."keys"\."storage_locations"[^\n]*/)?.[0];
const index = keysFile.match(/CREATE INDEX keys_storage_locations_idx[\s\S]*?;/)?.[0];

// The migration must carry the declarative files exactly.
assert.ok(keysFile.includes(`"storage_locations"        text[]                   NOT NULL DEFAULT '{}'::text[]`));
assert.ok(keysFile.includes('CONSTRAINT "keys_storage_locations_valid" CHECK (public.valid_key_storage_locations(storage_locations))'));
assert.ok(migration.includes(functionFile), 'migration includes the function file verbatim');
assert.ok(migration.includes('ADD CONSTRAINT "keys_storage_locations_valid" CHECK (public.valid_key_storage_locations(storage_locations));'));
assert.ok(comment && migration.includes(comment), 'migration includes the column comment');
assert.ok(index && migration.includes(index), 'migration includes the index');
assert.ok(migration.includes(revokedFunction), 'migration includes the revoked-status function verbatim');
assert.ok(revokedTrigger && migration.includes(revokedTrigger), 'migration includes the revoked-status trigger');
// The function's limit repeats MAX_KEY_STORAGE_LOCATIONS.
assert.equal(functionFile.match(/cardinality\(locations\) <= (\d+)/)?.[1], shared.match(/MAX_KEY_STORAGE_LOCATIONS = (\d+);/)?.[1]);

const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    grant usage on schema public to authenticated, service_role;
    create table public.keys (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null,
      name text not null,
      status text not null default 'active',
      revoked_at timestamptz
    );
    grant select, insert, update, delete on public.keys to authenticated, service_role;
    insert into public.keys (id, workspace_id, name) values
      ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', 'existing');
  `);
  await db.exec(migration);

  const locations = async (id) => (await db.query('select storage_locations from public.keys where id = $1', [id])).rows[0].storage_locations;

  // Existing keys have no location.
  assert.deepEqual(await locations('00000000-0000-4000-8000-000000000001'), []);

  await db.exec(`update public.keys set storage_locations = array['railway', '1password', 'deno-deploy'] where id = '00000000-0000-4000-8000-000000000001'`);
  assert.deepEqual(await locations('00000000-0000-4000-8000-000000000001'), ['railway', '1password', 'deno-deploy']);

  // Finding every key stored in one place.
  await db.exec(`insert into public.keys (workspace_id, name, storage_locations) values
    ('00000000-0000-4000-8000-0000000000bb', 'vercel only', array['vercel'])`);
  const railway = await db.query(`select name from public.keys where storage_locations @> array['railway']`);
  assert.deepEqual(railway.rows.map((row) => row.name), ['existing']);

  const bad = [
    `array['Railway']`,
    `array['rail way']`,
    `array['-railway']`,
    `array['']`,
    `array[null]::text[]`,
    `array['${'a'.repeat(41)}']`,
    `array['a','b','c','d','e','f','g','h','i']`,
    `array['railway,vercel']`,
  ];
  for (const value of bad) {
    await assert.rejects(
      db.exec(`update public.keys set storage_locations = ${value} where id = '00000000-0000-4000-8000-000000000001'`),
      /keys_storage_locations_valid/,
      value,
    );
  }
  await assert.rejects(db.exec(`update public.keys set storage_locations = null`), /null/i);

  // Revoked keys stay revoked, for every role.
  const id = '00000000-0000-4000-8000-000000000001';
  const status = async () => (await db.query('select status, revoked_at from public.keys where id = $1', [id])).rows[0];
  await db.exec(`update public.keys set status = 'paused' where id = '${id}'`);
  await db.exec(`update public.keys set status = 'active' where id = '${id}'`);
  assert.equal((await status()).revoked_at, null);
  await db.exec(`update public.keys set status = 'revoked' where id = '${id}'`);
  assert.ok((await status()).revoked_at instanceof Date, 'revoking stamps revoked_at');
  for (const role of ['authenticated', 'service_role', 'postgres']) {
    await db.exec(`set role ${role}`);
    for (const next of ['active', 'paused']) {
      await assert.rejects(db.exec(`update public.keys set status = '${next}' where id = '${id}'`), /key_revoked_locked/, `${role} ${next}`);
    }
    await db.exec('reset role');
  }
  // Other edits and deletion still work.
  await db.exec(`update public.keys set name = 'renamed', storage_locations = '{}' where id = '${id}'`);
  await db.exec(`update public.keys set status = 'deleted' where id = '${id}'`);
  assert.equal((await status()).status, 'deleted');

  console.log('key-storage-locations: ok');
} finally {
  await db.close();
}
