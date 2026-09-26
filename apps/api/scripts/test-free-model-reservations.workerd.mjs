import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
const require = createRequire(import.meta.url), wrangler = createRequire(require.resolve("wrangler/package.json"));
const { build } = wrangler("esbuild"), { Miniflare } = wrangler("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const db = new PGlite();
const workspace = "10000000-0000-4000-8000-000000000001", other = "10000000-0000-4000-8000-000000000002";
const key = "20000000-0000-4000-8000-000000000001";
const migration = name => readFile(new URL(`../../../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
const bundle = await build({ absWorkingDir: root, bundle: true, format: "esm", platform: "browser", write: false,
    external: ["cloudflare:*", "node:*"], stdin: { resolveDir: root, loader: "ts", contents: `
        import { configureRuntime, clearRuntime } from './src/runtime/env';
        import { reserveFreeModelOverage, finalizeFreeModelOverage } from './src/core/free-model-reservations';
        export default { async fetch(request, env) {
            configureRuntime(env);
            try {
                const input = await request.json(), operation = new URL(request.url).pathname.slice(1);
                return Response.json(await (operation === 'reserve' ? reserveFreeModelOverage(input)
                    : finalizeFreeModelOverage(input, operation)));
            } catch (error) { return Response.json({ error: error.message }, { status: 503 }); }
            finally { clearRuntime(); }
        } };
    ` } });
let corruptConfirmation = false, calls = 0;
async function source(request) {
    const url = new URL(request.url), input = await request.json(), operation = url.pathname.split('/').at(-1);
    assert.equal(url.hostname, 'source.invalid');
    assert.ok(['gateway_wallet_reserve_once', 'gateway_wallet_capture_once', 'gateway_wallet_release_once'].includes(operation));
    calls++;
    const args = operation === 'gateway_wallet_reserve_once'
        ? [input.p_workspace_id, input.p_reservation_id, input.p_amount_nanos, input.p_hold_ref_id, input.p_key_id, input.p_request_count]
        : [input.p_workspace_id, input.p_reservation_id, input.p_capture_ref_id ?? input.p_release_ref_id];
    const data = await db.transaction(async tx => {
        await tx.exec('set local role service_role');
        return (await tx.query(`select * from public.${operation}(${args.map((_, n) => `$${n + 1}`).join(',')})`, args)).rows;
    });
    if (corruptConfirmation) { corruptConfirmation = false; return Response.json([]); }
    return Response.json(data);
}
function runtime() {
    return new Miniflare({ modules: [{ type: 'ESModule', path: 'fee-reservation.mjs', contents: bundle.outputFiles[0].text }],
        compatibilityDate: '2025-10-01', compatibilityFlags: ['nodejs_compat'], kvNamespaces: ['GATEWAY_CACHE'],
        bindings: { SUPABASE_URL: 'https://source.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture' }, outboundService: source });
}
let mf;
try {
    // Synthetic schema, real unchanged budget/reservation/capture/release SQL.
    await db.exec(`create role anon; create role authenticated; create role service_role;
        create table wallets(workspace_id uuid primary key, balance_nanos bigint, reserved_nanos bigint, updated_at timestamptz);
        create table keys(id uuid primary key, workspace_id uuid, status text default 'active', expires_at timestamptz,
            soft_blocked boolean default false, daily_limit_requests bigint, weekly_limit_requests bigint, monthly_limit_requests bigint,
            daily_limit_cost_nanos bigint, weekly_limit_cost_nanos bigint, monthly_limit_cost_nanos bigint);
        create table gateway_requests(workspace_id uuid, request_id text, endpoint text, model_id text, provider text,
            status_code integer, success boolean, usage jsonb, cost_nanos bigint, currency text, key_id uuid, created_at timestamptz default now());
        create table gateway_wallet_reservations(workspace_id uuid, reservation_id text, amount_nanos bigint, status text,
            hold_ref_id text, key_id uuid, request_count integer, created_at timestamptz, settled_amount_nanos bigint,
            captured_nanos bigint, released_nanos bigint, capture_ref_id text, release_ref_id text,
            captured_at timestamptz, released_at timestamptz, updated_at timestamptz, primary key(workspace_id,reservation_id));
        create table credit_ledger(workspace_id uuid, kind text, amount_nanos bigint, before_balance_nanos bigint,
            after_balance_nanos bigint, before_reserved_nanos bigint, after_reserved_nanos bigint,
            ref_type text, ref_id text, source_ref_type text, source_ref_id text, status text);
        create table workspace_budgets(id uuid default gen_random_uuid(), workspace_id uuid, interval text, limit_nanos bigint,
            created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now());
    `);
    await db.exec(await migration('20260906160006_video_reservation_key_limits'));
    const budgets = await migration('20260830143100_workspace_budgets');
    for (const name of ['gateway_workspace_budget_status', 'gateway_wallet_reserve_once']) {
        const start = budgets.indexOf(`create or replace function public.${name}(`);
        const end = budgets.indexOf('$$;', start) + 3;
        assert.ok(start >= 0 && end > start);
        await db.exec(budgets.slice(start, end));
    }
    await db.exec(`revoke all on function gateway_wallet_reserve_once(uuid,text,bigint,text,uuid,integer) from public,anon,authenticated;
        grant execute on function gateway_wallet_reserve_once(uuid,text,bigint,text,uuid,integer) to service_role;`);
    await db.exec(await migration('20260906162500_async_reservation_replay'));
    if (!process.env.TEST_PRE_MIGRATION) await db.exec(await migration('20260926090000_free_model_reservation_exposure'));
    await db.query('insert into wallets values($1,1000000,0,null),($2,1000000,0,null)', [workspace, other]);
    await db.query('insert into keys(id,workspace_id,daily_limit_cost_nanos) values($1,$2,150000)', [key, workspace]);
    mf = runtime();
    const input = requestId => ({ workspaceId: workspace, keyId: key, requestId });
    const send = async (operation, body) => {
        const response = await mf.dispatchFetch(`https://worker.invalid/${operation}`, { method: 'POST', body: JSON.stringify(body) });
        return { status: response.status, body: await response.json() };
    };
    const first = await send('reserve', input('first'));
    assert.equal(first.body.status, 'held');
    assert.equal((await db.query('select count(*)::integer as count from gateway_requests')).rows[0].count, 0,
        'A free-model hold must not manufacture batch request facts');
    assert.equal((await send('reserve', input('first'))).body.alreadyApplied, true);
    assert.equal((await send('reserve', input('second'))).body.status, 'daily_cost_limit_reached');
    assert.equal((await send('reserve', { ...input('foreign'), workspaceId: other })).body.status, 'key_wrong_workspace');
    assert.equal((await send('release', input('first'))).body.status, 'released');
    assert.equal((await send('reserve', input('second'))).body.status, 'held');
    corruptConfirmation = true;
    assert.equal((await send('capture', input('second'))).status, 503);
    await mf.dispose(); mf = runtime();
    assert.equal((await send('capture', input('second'))).body.alreadyApplied, true);
    assert.equal((await send('reserve', input('third'))).body.status, 'daily_cost_limit_reached', 'Capture-to-audit gap retains exposure');
    await db.query('update keys set daily_limit_cost_nanos=null where id=$1', [key]);
    await db.query(`insert into workspace_budgets(workspace_id,interval,limit_nanos) values($1,'daily',150000)`, [workspace]);
    assert.equal((await send('reserve', input('budget-gap'))).body.status, 'workspace_daily_cost_budget_reached',
        'Workspace budget retains captured fee before audit');
    await db.exec('delete from workspace_budgets');
    await db.query(`insert into gateway_requests(workspace_id,request_id,key_id,success,cost_nanos) values($1,'second',$2,true,100000)`, [workspace, key]);
    await db.query('update keys set daily_limit_cost_nanos=200000 where id=$1', [key]);
    await db.query(`insert into workspace_budgets(workspace_id,interval,limit_nanos) values($1,'daily',200000)`, [workspace]);
    assert.equal((await send('reserve', input('third'))).body.status, 'held', 'An audited fee must not be counted twice');
    await db.query(`update gateway_wallet_reservations set created_at=now()-interval '2 days' where reservation_id='free_model_hold:third'`);
    assert.equal((await send('reserve', input('midnight'))).body.status, 'workspace_daily_cost_budget_reached',
        'Unfinished fee hold remains exposure across midnight');
    assert.equal((await send('release', input('third'))).body.status, 'released');
    await db.query('update keys set daily_limit_cost_nanos=null where id=$1', [key]);
    await db.exec('update workspace_budgets set limit_nanos=150000');
    assert.equal((await send('reserve', input('budget'))).body.status, 'workspace_daily_cost_budget_reached');
    for (const role of ['anon', 'authenticated']) await assert.rejects(db.transaction(async tx => {
        await tx.exec(`set local role ${role}`);
        await tx.query('select * from gateway_wallet_reserve_once($1,$2,100000,$3,$4,1)', [workspace, 'free_model_hold:forbidden', 'forbidden', key]);
    }), /permission denied/);
    assert.deepEqual((await db.query('select balance_nanos,reserved_nanos from wallets where workspace_id=$1', [workspace])).rows,
        [{ balance_nanos: 900000, reserved_nanos: 0 }]);
    assert.equal((await db.query('select count(*)::integer as count from credit_ledger')).rows[0].count, 1);
    await db.exec('delete from workspace_budgets');
    await db.query('update keys set daily_limit_requests=1 where id=$1', [key]);
    assert.equal((await send('reserve', input('request-limit'))).body.status, 'daily_request_limit_reached');
    await db.query("update keys set daily_limit_requests=null, status='disabled' where id=$1", [key]);
    assert.equal((await send('reserve', input('revoked'))).body.status, 'key_not_active');
    await db.query("update keys set status='active' where id=$1", [key]);
    await db.query('update wallets set balance_nanos=99999 where workspace_id=$1', [workspace]);
    assert.equal((await send('reserve', input('empty-wallet'))).body.status, 'insufficient_balance');
    await db.query('update wallets set balance_nanos=900000 where workspace_id=$1', [workspace]);
    // Existing video and batch behavior must remain unchanged by classification.
    for (const kind of ['video', 'batch']) {
        const rid = `${kind}_hold:legacy`, before = (await db.query('select count(*)::integer as count from gateway_requests')).rows[0].count;
        const held = await db.query('select * from gateway_wallet_reserve_once($1,$2,100,$3,$4,1)', [workspace, rid, `${kind}-legacy`, key]);
        assert.equal(held.rows[0].ok, true);
        const after = (await db.query('select count(*)::integer as count from gateway_requests')).rows[0].count;
        assert.equal(after - before, kind === 'batch' ? 1 : 0);
        await db.query('select * from gateway_wallet_release_once($1,$2,$3)', [workspace, rid, `${kind}-legacy`]);
    }
    console.log(JSON.stringify({ result: 'PASS', calls, fixedFeeNanos: 100000, ledgerDebits: 1, syntheticBatchRows: 0,
        keyAndWorkspaceLimits: true, releaseAndCaptureReplay: true, externalCalls: 0,
        limits: 'Local PGlite and native Workers; not deployed migration or concurrent PostgreSQL locking evidence' }));
} finally { await mf?.dispose(); await db.close(); }
