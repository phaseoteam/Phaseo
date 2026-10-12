import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const workspace = '10000000-0000-4000-8000-000000000001';
const destination = '20000000-0000-4000-8000-000000000001';
const prune = async limit => (await db.query('select public.prune_otel_export_outbox($1) deleted', [limit])).rows[0].deleted;
const remaining = async () => (await db.query('select event_id from public.otel_export_outbox order by event_id')).rows.map(row => row.event_id);
try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      grant usage on schema public to anon, authenticated, service_role;
      create table public.workspaces(id uuid primary key);
      create table public.workspace_broadcast_destinations(id uuid primary key);
    `);
    await db.exec(await read('../schemas/public/tables/otel_export_outbox.sql'));
    await db.exec(await read('../schemas/public/functions/prune_otel_export_outbox.sql'));
    await db.query('insert into public.workspaces values($1)', [workspace]);
    await db.query('insert into public.workspace_broadcast_destinations values($1)', [destination]);
    const rows = [
        ['delivered-fresh', 'delivered', '2 hours'],
        ['delivered-old', 'delivered', '25 hours'],
        ['failed-recent', 'failed', '2 days'],
        ['failed-old', 'failed', '8 days'],
        ['pending-recent', 'pending', '2 days'],
        ['pending-old', 'pending', '8 days'],
        ['processing-old', 'processing', '8 days'],
    ];
    for (const [event, status, age] of rows) {
        await db.query(
            `insert into public.otel_export_outbox(workspace_id,destination_id,event_id,payload,status,created_at)
             values($1,$2,$3,'{}',$4,now() - $5::interval)`,
            [workspace, destination, event, status, age],
        );
    }

    // Backend-only: signed-in users cannot delete export rows.
    for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`);
        await assert.rejects(prune(10), /permission denied/);
        await db.exec('reset role');
    }

    // Batches are bounded and oldest first.
    assert.equal(await prune(1), 1);
    assert.equal((await remaining()).length, rows.length - 1);
    assert.equal(await prune(null), 3);
    assert.deepEqual(await remaining(), ['delivered-fresh', 'failed-recent', 'pending-recent']);
    assert.equal(await prune(5000), 0);
    console.log('otel export outbox prune: ok');
} finally {
    await db.close();
}
