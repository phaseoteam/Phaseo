import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
try {
  await db.exec(`create table public.oauth_clients (
    id text primary key, name text, description text, homepage_url text,
    client_type text, redirect_uris text[], allowed_scopes text[],
    is_first_party boolean, beta_status text, status text, client_secret_hash text
  )`);
  const migration = await readFile(new URL('../migrations/20261005113000_register_desktop_oauth_client.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration);
  const { rows } = await db.query('select * from public.oauth_clients');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'phaseo_desktop');
  assert.equal(rows[0].client_type, 'public');
  assert.equal(rows[0].is_first_party, true);
  assert.equal(rows[0].client_secret_hash, null);
  assert.deepEqual(rows[0].redirect_uris, ['http://127.0.0.1/callback']);
  assert.deepEqual(rows[0].allowed_scopes, ['openid', 'profile', 'email', 'gateway:access', 'models:read']);
  await db.exec("update public.oauth_clients set status = 'suspended'");
  await db.exec(migration);
  assert.equal((await db.query('select status from public.oauth_clients')).rows[0].status, 'suspended');
  console.log('Desktop OAuth client migration passed: idempotent, scoped, preserves suspension.');
} finally {
  await db.close();
}
