import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const workspace = '10000000-0000-4000-8000-000000000001';
const request = '20000000-0000-4000-8000-000000000001';
const fact = '30000000-0000-4000-8000-000000000001';
const created = '2026-09-20T00:00:00Z';
const sha = 'a'.repeat(64);
const requestHash = createHash('sha256').update('request').digest('hex');
const reference = { version: 1, key: `workspaces/${workspace}/routing/v1/${requestHash}/${sha}.json`, sha256: sha, bytes: 500 };
const source = async () => (await db.query('select public.gateway_routing_archive_source($1,$2) value', [request, created])).rows[0].value;
const commit = async (hash, pointer = reference) => (await db.query(
    'select public.gateway_commit_routing_archive($1,$2,$3,$4) value', [request, created, hash, pointer],
)).rows[0].value;
try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      grant usage on schema public to anon, authenticated, service_role;
      create table public.gateway_requests(id uuid,created_at timestamptz,workspace_id uuid,request_id text,
        detail_metadata jsonb,cost_nanos bigint,usage jsonb,primary key(id,created_at));
      create table public.v2_request_facts(request_event_id uuid primary key,gateway_request_id uuid,
        gateway_request_created_at timestamptz,workspace_id uuid,request_id text,cost_nanos bigint);
      create table public.v2_model_provider_routes(provider_model_id text primary key,provider_slug text,provider_model_slug text);
      create table public.v2_request_attempts(request_event_id uuid,attempt_number integer,provider_model_id text);
      create table public.v2_request_usage(request_event_id uuid,quantity numeric);
      create function public.is_workspace_member(uuid) returns boolean language sql as 'select false';
      create function public.ingest_v2_gateway_request(jsonb) returns uuid language sql as
        'select request_event_id from public.v2_request_facts where workspace_id=($1->>''workspace_id'')::uuid and request_id=$1->>''request_id''';
    `);
    await db.exec(await read('../schemas/public/tables/v2_request_routing_decisions.sql'));
    await db.exec(await read('../schemas/public/tables/v2_request_routing_traces.sql'));
    if (process.env.ROUTING_ARCHIVE_MIGRATION) {
        await db.exec(await read(`../migrations/${process.env.ROUTING_ARCHIVE_MIGRATION}`));
    } else {
        for (const name of ['gateway_routing_archive_source', 'gateway_routing_archive_batch', 'gateway_commit_routing_archive', 'ingest_v2_gateway_request_with_routing']) {
            await db.exec(await read(`../schemas/public/functions/${name}.sql`));
        }
        await db.exec(await read('../schemas/public/tables/gateway_routing_archive_deletions.sql'));
        await db.exec(await read('../schemas/public/functions/enqueue_gateway_routing_archive_deletion.sql'));
        const gatewayDefinition = await read('../schemas/public/tables/gateway_requests.sql');
        await db.exec(gatewayDefinition.match(/CREATE TRIGGER gateway_requests_routing_archive_delete[\s\S]*?;/)[0]);
    }
    await db.query(`insert into public.gateway_requests values($1,$2,$3,'request',$4,5000,'{"input_tokens":100}')`,
        [request, created, workspace, { routing_snapshot: [{ score: 0.5 }], routing_diagnostics: { algorithm: 'v2' }, accounting_finalization: { settled: true } }]);
    await db.query(`insert into public.v2_request_facts values($1,$2,$3,$4,'request',5000)`, [fact, request, created, workspace]);
    await db.query(`insert into public.v2_request_usage values($1,100)`, [fact]);
    await db.query(`insert into public.v2_request_routing_decisions(request_event_id,decision_order,provider_slug,decision,score) values($1,1,'provider','ranked',0.5)`, [fact]);
    await db.query(`insert into public.v2_request_routing_traces(request_event_id,algorithm_version) values($1,'v2')`, [fact]);

    // Backend-only source and mutation: signed-in users cannot inspect other tenants or remove data.
    for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`);
        await assert.rejects(source(), /permission denied/);
        await assert.rejects(commit('hash'), /permission denied/);
        await assert.rejects(db.query('select public.gateway_routing_archive_batch($1,$2,$3,25)',
            ['00000000-0000-0000-0000-000000000000', '1970-01-01', '2026-10-01']), /permission denied/);
        await db.exec('reset role');
    }
    await db.exec('set role service_role');
    const before = await source();
    assert.equal(before.routing_decisions.length, 1);
    const batch = await db.query('select public.gateway_routing_archive_batch($1,$2,$3,25) value',
        ['00000000-0000-0000-0000-000000000000', '1970-01-01', '2026-10-01']);
    assert.equal(batch.rows.length, 1);
    assert.equal(await commit('stale-source'), false);
    await assert.rejects(commit(before.source_hash, { ...reference, key: `workspaces/other/routing/v1/request/${sha}.json` }), /reference_invalid/);
    assert.equal((await source()).routing_decisions.length, 1);
    await db.exec('reset role');
    await db.query(`update public.v2_request_routing_decisions set score=0.7 where request_event_id=$1`, [fact]);
    await db.exec('set role service_role');
    assert.equal(await commit(before.source_hash), false);
    const changed = await source();
    assert.equal(await commit(changed.source_hash), true);
    assert.equal(await commit(changed.source_hash), true); // retry is idempotent
    assert.equal(await source(), null);
    await db.exec('reset role');
    const after = (await db.query('select * from public.gateway_requests')).rows[0];
    assert.equal(after.cost_nanos, 5000);
    assert.equal(after.usage.input_tokens, 100);
    assert.deepEqual(after.detail_metadata.accounting_finalization, { settled: true });
    assert.deepEqual(after.detail_metadata.routing_archive, reference);
    assert.ok(!('routing_snapshot' in after.detail_metadata));
    assert.equal((await db.query('select count(*) n from public.v2_request_routing_decisions')).rows[0].n, 0);
    assert.equal((await db.query('select count(*) n from public.v2_request_routing_traces')).rows[0].n, 0);
    assert.equal((await db.query('select quantity from public.v2_request_usage')).rows[0].quantity, '100');
    assert.equal((await db.query('select cost_nanos from public.v2_request_facts')).rows[0].cost_nanos, 5000);

    // New archived events skip relational candidate multiplication; fallback events keep it.
    const event = { workspace_id: workspace, request_id: 'request', routing_decisions: [
        { provider: 'provider', decision: 'ranked', score: 0.9, decision_order: 1 },
    ], routing_trace: { algorithm: { version: 'fallback' } } };
    await db.exec('set role service_role');
    await db.query('select public.ingest_v2_gateway_request_with_routing($1)', [{ ...event, routing_archive: reference }]);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*) n from public.v2_request_routing_decisions')).rows[0].n, 0);
    await db.exec('set role service_role');
    await db.query('select public.ingest_v2_gateway_request_with_routing($1)', [event]);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*) n from public.v2_request_routing_decisions')).rows[0].n, 1);
    await db.query('delete from public.gateway_requests where id=$1 and created_at=$2', [request, created]);
    await db.exec('set role service_role');
    assert.equal((await db.query('select object_prefix from public.gateway_routing_archive_deletions')).rows[0].object_prefix, reference.key.slice(0, -69));
    await assert.rejects(db.query("insert into public.gateway_routing_archive_deletions(object_prefix) values('untrusted')"), /permission denied/);
    await db.exec('reset role');
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select * from public.gateway_routing_archive_deletions'), /permission denied/);
    await db.exec('reset role');
    console.log('Routing archive SQL permissions, source concurrency, idempotency, fallback and accounting preservation passed.');
} finally { await db.close(); }
