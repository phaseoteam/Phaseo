import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const table = await read('../schemas/public/tables/notification_destinations.sql');
const migration = await read('../migrations/20261022090625_notification_destination_signing_secrets.sql');
const prelude = `
  create role anon; create role authenticated; create role service_role;
  create schema auth; create table auth.users(id uuid primary key);
  create table public.workspaces(id uuid primary key);
`;
const workspace = '10000000-0000-4000-8000-000000000001';
const insert = (db, type, secret) => db.query(
    `insert into public.notification_destinations(workspace_id,name,type,target_ciphertext,target_iv,target_hash,target_preview,signing_secret_ciphertext,signing_secret_iv,signing_secret_key_version)
     values($1,'d',$2,'c','i',gen_random_uuid()::text,'p',$3,$4,$5) returning id`,
    [workspace, type, secret?.ciphertext ?? null, secret?.iv ?? null, secret ? 'v1' : null],
);
const shape = async db => ({
    columns: (await db.query(`select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'notification_destinations' order by column_name`)).rows,
    constraints: (await db.query(`select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.notification_destinations'::regclass order by conname`)).rows,
});

const declared = new PGlite();
const migrated = new PGlite();
try {
    await declared.exec(prelude);
    await declared.exec(table);
    await declared.query('insert into public.workspaces values($1)', [workspace]);

    // Custom webhooks may hold a secret; legacy rows without one stay valid.
    await insert(declared, 'custom_webhook', { ciphertext: 'secret-ciphertext', iv: 'secret-iv' });
    await insert(declared, 'custom_webhook', null);
    await insert(declared, 'slack', null);

    // Only custom webhooks are signed, and ciphertext and IV go together.
    await assert.rejects(insert(declared, 'slack', { ciphertext: 'c', iv: 'i' }), /notification_destinations_signing_secret_check/);
    await assert.rejects(insert(declared, 'custom_webhook', { ciphertext: 'c', iv: null }), /notification_destinations_signing_secret_check/);
    await assert.rejects(insert(declared, 'custom_webhook', { ciphertext: null, iv: 'i' }), /notification_destinations_signing_secret_check/);

    // Rotation is an update of the secret columns on an existing legacy row.
    const legacy = (await declared.query(`select id from public.notification_destinations where type = 'custom_webhook' and signing_secret_ciphertext is null`)).rows[0].id;
    await declared.query(`update public.notification_destinations set signing_secret_ciphertext = 'new', signing_secret_iv = 'iv', signing_secret_key_version = 'v1', signing_secret_rotated_at = now() where id = $1`, [legacy]);
    assert.equal((await declared.query(`select count(*)::int as n from public.notification_destinations where signing_secret_ciphertext is not null`)).rows[0].n, 2);

    // The migration applied to the previous table produces the declared table.
    await migrated.exec(prelude);
    const previous = table
        .split('\n')
        .filter(line => !line.includes('signing_secret'))
        .join('\n');
    await migrated.exec(previous);
    await migrated.query('insert into public.workspaces values($1)', [workspace]);
    // An existing destination from before signing.
    await migrated.query(`insert into public.notification_destinations(workspace_id,name,type,target_ciphertext,target_iv,target_hash,target_preview) values($1,'legacy','custom_webhook','c','i','h','p')`, [workspace]);
    await migrated.exec(migration.replace(/^SET local check_function_bodies = off;$/m, ''));
    assert.deepEqual(await shape(migrated), await shape(declared));
    // It survives the migration unsigned.
    assert.deepEqual((await migrated.query(`select signing_secret_ciphertext, signing_secret_rotated_at from public.notification_destinations where name = 'legacy'`)).rows, [{ signing_secret_ciphertext: null, signing_secret_rotated_at: null }]);

    console.log('notification destination signing secrets: ok');
} finally {
    await declared.close();
    await migrated.close();
}
