import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const prune = async limit => (await db.query('select public.prune_broadcast_event_receipts($1) deleted', [limit])).rows[0].deleted;
const remaining = async () => (await db.query('select event_id from public.broadcast_event_receipts order by event_id')).rows.map(row => row.event_id);
const claim = async ids => (await db.query(
    'insert into public.broadcast_event_receipts(event_id) select unnest($1::text[]) on conflict (event_id) do nothing returning event_id',
    [ids],
)).rows.map(row => row.event_id).sort();
try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      grant usage on schema public to anon, authenticated, service_role;
    `);
    await db.exec(await read('../schemas/public/tables/broadcast_event_receipts.sql'));
    await db.exec(await read('../schemas/public/functions/prune_broadcast_event_receipts.sql'));

    // The consumer's insert returns only ids it has not seen before.
    await db.exec('set role service_role');
    assert.deepEqual(await claim(['gateway:a', 'gateway:b']), ['gateway:a', 'gateway:b']);
    assert.deepEqual(await claim(['gateway:b', 'gateway:c']), ['gateway:c']);
    await db.exec('reset role');

    // Backend-only: signed-in users can neither read receipts nor prune them.
    for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`);
        await assert.rejects(db.query('select * from public.broadcast_event_receipts'), /permission denied/);
        await assert.rejects(prune(10), /permission denied/);
        await db.exec('reset role');
    }

    await db.exec(`
      update public.broadcast_event_receipts set received_at = now() - interval '6 days' where event_id in ('gateway:a', 'gateway:b');
      update public.broadcast_event_receipts set received_at = now() - interval '4 days' where event_id = 'gateway:c';
    `);
    assert.equal(await prune(1), 1);
    assert.equal(await prune(null), 1);
    assert.deepEqual(await remaining(), ['gateway:c']);
    assert.equal(await prune(5000), 0);
    console.log('broadcast event receipts: ok');
} finally {
    await db.close();
}
