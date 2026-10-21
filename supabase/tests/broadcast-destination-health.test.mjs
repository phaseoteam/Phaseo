import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const workspace = '10000000-0000-4000-8000-000000000001';
const record = results => db.query('select public.record_broadcast_destination_health($1::jsonb) as recorded', [JSON.stringify(results)]);
const health = async id => (await db.query('select * from public.broadcast_destination_health where destination_id = $1', [id])).rows[0];
const counts = async id => (await db.query('select sum(delivered)::int as delivered, sum(failed)::int as failed from public.broadcast_destination_delivery_hourly where destination_id = $1', [id])).rows[0];
try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      grant usage on schema public to anon, authenticated, service_role;
      create table public.workspaces(id uuid primary key);
      create function public.is_workspace_admin(uuid) returns boolean language sql as 'select true';
      create function public.set_updated_at_if_changed() returns trigger language plpgsql as 'begin new.updated_at = now(); return new; end';
    `);
    await db.exec(await read('../schemas/public/functions/enforce_broadcast_destination_limit.sql'));
    await db.exec(await read('../schemas/public/tables/workspace_broadcast_destination_limits.sql'));
    await db.exec(await read('../schemas/public/tables/workspace_broadcast_destinations.sql'));
    for (const file of ['tables/broadcast_destination_health', 'tables/broadcast_destination_delivery_hourly', 'functions/record_broadcast_destination_health', 'functions/prune_broadcast_destination_delivery_hourly', 'functions/broadcast_destination_health_summary']) {
        await db.exec(await read(`../schemas/public/${file}.sql`));
    }
    await db.query('insert into public.workspaces values($1)', [workspace]);
    const id = (await db.query(`insert into public.workspace_broadcast_destinations(workspace_id,destination_id,name) values($1,'webhook','d') returning id`, [workspace])).rows[0].id;

    // Failures with no success extend the streak and keep the latest error.
    await record([{ destination_id: id, delivered: 0, failed: 2, failures: 2, last_failure_at: '2026-10-21T10:00:00Z', last_http_status: 503, last_error: 'Webhook endpoint returned 503' }]);
    await record([{ destination_id: id, delivered: 0, failed: 1, failures: 3, last_failure_at: '2026-10-21T10:05:00Z', last_http_status: 401, last_error: 'x'.repeat(900) }]);
    let row = await health(id);
    assert.equal(row.consecutive_failures, 5);
    assert.equal(row.last_success_at, null);
    assert.equal(row.last_http_status, 401);
    assert.equal(row.last_error.length, 500);
    assert.equal(row.workspace_id, workspace);

    // A batch with a success resets the streak to the failures after it, and an
    // all-success batch keeps the last error for reference.
    await record([{ destination_id: id, delivered: 4, failed: 0, failures: 1, last_success_at: '2026-10-21T10:10:00Z', last_failure_at: '2026-10-21T10:11:00Z', last_http_status: 429, last_error: 'Webhook endpoint returned 429' }]);
    assert.equal((await health(id)).consecutive_failures, 1);
    await record([{ destination_id: id, delivered: 6, failed: 0, failures: 0, last_success_at: '2026-10-21T10:15:00Z' }]);
    row = await health(id);
    assert.equal(row.consecutive_failures, 0);
    assert.equal(row.last_success_at.toISOString(), '2026-10-21T10:15:00.000Z');
    assert.equal(row.last_failure_at.toISOString(), '2026-10-21T10:11:00.000Z');
    assert.equal(row.last_error, 'Webhook endpoint returned 429');

    // An older timestamp from a slower batch does not move the latest back.
    await record([{ destination_id: id, delivered: 1, failed: 0, failures: 0, last_success_at: '2026-10-21T10:12:00Z' }]);
    assert.equal((await health(id)).last_success_at.toISOString(), '2026-10-21T10:15:00.000Z');

    // Batches can commit out of order. A failure older than the stored success
    // does not mark the destination failing, and a success older than the stored
    // failure does not clear it.
    await record([{ destination_id: id, delivered: 0, failed: 0, failures: 2, last_failure_at: '2026-10-21T10:13:00Z', last_http_status: 500, last_error: 'stale failure' }]);
    row = await health(id);
    assert.equal(row.consecutive_failures, 0);
    assert.equal(row.last_failure_at.toISOString(), '2026-10-21T10:13:00.000Z');
    assert.equal(row.last_error, 'stale failure', 'the newest failure is still the one shown');
    await record([{ destination_id: id, delivered: 0, failed: 0, failures: 1, last_failure_at: '2026-10-21T10:20:00Z', last_http_status: 503, last_error: 'Webhook endpoint returned 503' }]);
    await record([{ destination_id: id, delivered: 0, failed: 0, failures: 0, last_success_at: '2026-10-21T10:18:00Z' }]);
    row = await health(id);
    assert.equal(row.consecutive_failures, 1);
    assert.equal(row.last_success_at.toISOString(), '2026-10-21T10:18:00.000Z');
    // An older failure arriving after a newer one leaves the latest error in place.
    await record([{ destination_id: id, delivered: 0, failed: 0, failures: 1, last_failure_at: '2026-10-21T10:19:00Z', last_http_status: 400, last_error: 'older' }]);
    row = await health(id);
    assert.equal(row.consecutive_failures, 2);
    assert.equal(row.last_error, 'Webhook endpoint returned 503');
    assert.equal(row.last_http_status, 503);
    await record([{ destination_id: id, delivered: 0, failed: 0, failures: 0, last_success_at: '2026-10-21T10:25:00Z' }]);
    assert.equal((await health(id)).consecutive_failures, 0);

    // Event counts add up within the hour.
    assert.deepEqual(await counts(id), { delivered: 11, failed: 3 });

    // The summary lists every destination in the workspace with its last day.
    const quiet = (await db.query(`insert into public.workspace_broadcast_destinations(workspace_id,destination_id,name) values($1,'otel_collector','q') returning id`, [workspace])).rows[0].id;
    await db.query(`insert into public.broadcast_destination_delivery_hourly(destination_id,hour,workspace_id,delivered,failed) values($1, date_trunc('hour', now()) - interval '2 days', $2, 50, 50)`, [id, workspace]);
    // The bucket that started 24 hours ago is outside the window; the one after it is inside.
    await db.query(`insert into public.broadcast_destination_delivery_hourly(destination_id,hour,workspace_id,delivered,failed) values($1, date_trunc('hour', now(), 'UTC') - interval '24 hours', $2, 1000, 0), ($1, date_trunc('hour', now(), 'UTC') - interval '23 hours', $2, 7, 0)`, [id, workspace]);
    const summary = (await db.query('select * from public.broadcast_destination_health_summary($1) order by delivered_24h desc', [workspace])).rows;
    assert.equal(summary.length, 2);
    assert.equal(summary[0].destination_id, id);
    assert.equal(Number(summary[0].delivered_24h), 18);
    assert.equal(Number(summary[0].failed_24h), 3);
    assert.equal(summary[0].consecutive_failures, 0);
    assert.deepEqual({ ...summary[1], delivered_24h: Number(summary[1].delivered_24h), failed_24h: Number(summary[1].failed_24h) }, {
        destination_id: quiet, last_success_at: null, last_failure_at: null, last_http_status: null, last_error: null,
        consecutive_failures: 0, delivered_24h: 0, failed_24h: 0,
    });
    assert.equal((await db.query('select count(*)::int as n from public.broadcast_destination_health_summary($1)', ['10000000-0000-4000-8000-000000000002'])).rows[0].n, 0);

    // Unknown destinations and malformed input are ignored.
    assert.equal((await record([{ destination_id: '20000000-0000-4000-8000-000000000009', delivered: 1, last_success_at: '2026-10-21T10:00:00Z' }])).rows[0].recorded, 0);
    assert.equal((await db.query(`select public.record_broadcast_destination_health('{"a":1}'::jsonb) as recorded`)).rows[0].recorded, 0);

    // Pruning keeps eight days of hourly counts.
    await db.query(`insert into public.broadcast_destination_delivery_hourly(destination_id,hour,workspace_id,delivered) values($1, date_trunc('hour', now()) - interval '9 days', $2, 1)`, [id, workspace]);
    assert.equal((await db.query('select public.prune_broadcast_destination_delivery_hourly() as deleted')).rows[0].deleted, 1);
    assert.equal((await db.query('select count(*)::int as n from public.broadcast_destination_delivery_hourly')).rows[0].n, 4);
    assert.deepEqual(await counts(id), { delivered: 1068, failed: 53 });

    // Clients cannot read or write health directly.
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select * from public.broadcast_destination_health'), /permission denied/);
    await assert.rejects(db.query('select public.record_broadcast_destination_health($1::jsonb)', ['[]']), /permission denied/);
    await assert.rejects(db.query('select * from public.broadcast_destination_health_summary($1)', [workspace]), /permission denied/);
    await db.exec('reset role');

    // Deleting the destination deletes its health.
    await db.query('delete from public.workspace_broadcast_destinations where workspace_id = $1', [workspace]);
    assert.equal((await db.query('select count(*)::int as n from public.broadcast_destination_health')).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int as n from public.broadcast_destination_delivery_hourly')).rows[0].n, 0);

    console.log('broadcast destination health: ok');
} finally {
    await db.close();
}
