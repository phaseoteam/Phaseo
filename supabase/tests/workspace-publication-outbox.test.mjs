import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const a = '10000000-0000-4000-8000-000000000001';
const b = '10000000-0000-4000-8000-000000000002';
const g = '20000000-0000-4000-8000-000000000001';
const r = '30000000-0000-4000-8000-000000000001';
const rows = async () => (await db.query('select * from public.gateway_workspace_publications order by workspace_id')).rows;
const claim = async (workspace = null, limit = 25) => (await db.query('select * from public.gateway_claim_workspace_publications($1,$2)', [limit, workspace])).rows;
const finish = async (row, success = true) => (await db.query('select public.gateway_finish_workspace_publication($1,$2,$3,$4) as state',
    [row.workspace_id, row.revision, row.lease_id, success])).rows[0].state;
const change = () => db.query('update public.workspace_settings set routing_mode=gen_random_uuid()::text where workspace_id=$1', [a]);

try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema private;
      create table public.workspaces(id uuid primary key, tier text, billing_mode text);
      create table public.workspace_settings(workspace_id uuid primary key references public.workspaces on delete cascade, routing_mode text, updated_at timestamptz);
      create table public.byok_keys(id uuid primary key, workspace_id uuid references public.workspaces on delete cascade, enabled boolean, enc_value text, updated_at timestamptz, last_used_at timestamptz);
      create table public.workspace_private_models(id uuid primary key, workspace_id uuid references public.workspaces on delete cascade, enabled boolean);
      create table public.workspace_guardrails(id uuid primary key, workspace_id uuid references public.workspaces on delete cascade, enabled boolean);
      create table public.key_guardrails(key_id uuid, guardrail_id uuid references public.workspace_guardrails on delete cascade);
      create table public.workspace_member_guardrails(workspace_id uuid references public.workspaces on delete cascade, guardrail_id uuid references public.workspace_guardrails on delete cascade);
      create table public.gateway_dynamic_routes(id uuid primary key, workspace_id uuid references public.workspaces on delete cascade, config jsonb);
      create table public.gateway_dynamic_route_keys(route_id uuid references public.gateway_dynamic_routes on delete cascade, key_id uuid);
      create table public.wallets(workspace_id uuid, balance_nanos bigint);
      insert into public.workspaces values ('${a}','basic','wallet'),('${b}','basic','wallet');
      insert into public.workspace_settings values ('${a}','balanced',now()),('${b}','balanced',now());
      grant select, insert, update, delete on all tables in schema public to service_role;
      grant update on public.workspace_settings to authenticated;
    `);
    const migration = await readFile(new URL('../migrations/20260925204809_gateway_workspace_publication_outbox.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`);
        await assert.rejects(rows(), /permission denied/);
        await assert.rejects(claim(a), /permission denied/);
        await assert.rejects(db.query('select private.enqueue_gateway_workspace_publication($1)', [a]), /permission denied/);
        await db.exec('reset role');
    }
    // Existing authorized source mutations can enqueue via the trigger; no new
    // direct table/RPC permission is given to the authenticated role.
    await db.exec('set role authenticated');
    await db.exec("update public.workspace_settings set routing_mode='price'");
    await db.exec('reset role');
    assert.equal((await rows()).length, 2);
    await db.exec('delete from public.gateway_workspace_publications');
    await db.exec('set role service_role');
    await db.exec('begin'); await change(); await db.exec('rollback');
    assert.equal((await rows()).length, 0, 'rolled-back mutations cannot enqueue');
    await change();
    const initial = (await rows())[0];
    for (let i = 0; i < 20; i++) await change();
    assert.equal((await rows()).length, 1);
    assert.notEqual((await rows())[0].revision, initial.revision);
    const [leased] = await claim();
    assert.equal((await claim()).length, 0, 'another claimant cannot steal the lease');
    await change();
    assert.equal((await claim()).length, 0, 'mutation preserves active lease');
    assert.equal(await finish(leased), 'superseded');
    const [latest] = await claim();
    assert.equal(await finish(leased), 'lost', 'stale owner cannot acknowledge a newer lease');
    assert.equal(await finish(latest), 'completed');
    assert.equal(await finish(latest), 'lost', 'duplicate ack is harmless');
    assert.equal((await rows()).length, 0);
    // Explicit invalidation also creates durable intent without a source write.
    const [manual] = await claim(a, 1);
    assert.equal(manual.workspace_id, a);
    assert.equal(await finish(manual, false), 'retry');
    assert.equal((await claim()).length, 0, 'backoff is enforced');
    await db.exec("update public.gateway_workspace_publications set available_at=now()-interval '1 second'");
    const [abandoned] = await claim();
    await db.exec("update public.gateway_workspace_publications set lease_until=now()-interval '1 second'");
    const [reclaimed] = await claim();
    assert.notEqual(abandoned.lease_id, reclaimed.lease_id);
    assert.equal(await finish(abandoned), 'lost');
    assert.equal(await finish(reclaimed), 'completed');
    for (let i = 1; i <= 10; i++) {
        if (i === 1) await change();
        await db.exec("update public.gateway_workspace_publications set available_at=now()-interval '1 second'");
        const [attempt] = await claim();
        assert.equal(await finish(attempt, false), i === 10 ? 'exhausted' : 'retry');
    }
    await db.exec("update public.gateway_workspace_publications set available_at=now()-interval '1 day'");
    assert.equal((await claim()).length, 0, 'retry budget is finite');
    await change();
    assert.equal((await rows())[0].attempts, 0, 'new mutation revives exhausted work');
    await finish((await claim())[0]);
    // BYOK touches are advisory; changes to credentials and enabled state are not.
    await db.query('insert into public.byok_keys(id,workspace_id,enabled,enc_value) values ($1,$2,true,$3)', [g,a,'test-only-ciphertext']);
    await finish((await claim())[0]);
    await db.exec('update public.byok_keys set last_used_at=now(),updated_at=now()');
    assert.equal((await rows()).length, 0);
    await db.exec('update public.byok_keys set enabled=false');
    assert.equal((await rows()).length, 1); await finish((await claim())[0]);
    await db.exec("update public.byok_keys set enc_value='rotated-test-ciphertext'");
    assert.equal((await rows()).length, 1); await finish((await claim())[0]);
    await db.query('insert into public.workspace_guardrails values ($1,$2,true)', [g,a]);
    await finish((await claim())[0]);
    await db.query('insert into public.key_guardrails values ($1,$2)', [r,g]);
    assert.equal((await claim())[0].workspace_id, a);
    await db.exec('delete from public.gateway_workspace_publications');
    await db.query('insert into public.gateway_dynamic_routes values ($1,$2,$3)', [r,b,{}]);
    await finish((await claim())[0]);
    await db.query('insert into public.gateway_dynamic_route_keys values ($1,$2)', [r,g]);
    assert.equal((await claim())[0].workspace_id, b);
    await db.exec('delete from public.gateway_workspace_publications');
    await db.query('insert into public.workspace_member_guardrails values ($1,$2)', [a,g]);
    assert.equal((await claim())[0].workspace_id, a);
    await db.exec('delete from public.gateway_workspace_publications');
    await db.query('insert into public.workspace_private_models values ($1,$2,true)', [g,a]);
    await finish((await claim())[0]);
    await db.query('update public.workspace_private_models set workspace_id=$1', [b]);
    assert.deepEqual((await rows()).map(row => row.workspace_id), [a,b], 'both old and new owners invalidate');
    await db.exec('delete from public.gateway_workspace_publications');
    await db.query('insert into public.wallets values ($1,1000000000)', [a]);
    await db.exec('update public.wallets set balance_nanos=0');
    assert.equal((await rows()).length, 0, 'financial writes are not publication writes');
    await db.query("update public.workspaces set tier='pro' where id=$1", [a]);
    assert.equal((await rows()).length, 1);
    await db.query('delete from public.workspaces where id=$1', [a]);
    assert.equal((await rows()).length, 0, 'cascades do not recreate deleted workspace intent');
    await assert.rejects(claim(null, 101), /invalid_publication_limit/);
    await assert.rejects(claim(null, 0), /invalid_publication_limit/);
    await db.exec('reset role');
    const security = await db.query("select proname,prosecdef,proconfig from pg_proc where proname in ('gateway_claim_workspace_publications','gateway_finish_workspace_publication')");
    for (const row of security.rows) { assert.equal(row.prosecdef,false); assert.deepEqual(row.proconfig,['search_path=""']); }
    console.log('Workspace publication SQL passed: rollback, coalescing, lease/revision fencing, restart/retry bounds, role denial, mutation coverage, advisory/financial exclusion, cascades and idempotent migration.');
} finally { await db.close(); }
