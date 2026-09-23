import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { workspaceRuntimeSchema } from '../../apps/api/src/pipeline/before/workspaceRuntimeSnapshot.ts';

// Node >=22.18 (or --experimental-strip-types on older supported Node 22).
// Entirely local: actual PostgreSQL function output is checked by the Worker schema.
const db = new PGlite();
const wsA = '10000000-0000-4000-8000-000000000001';
const wsB = '10000000-0000-4000-8000-000000000002';
const keyA = '20000000-0000-4000-8000-000000000001';
const keyB = '20000000-0000-4000-8000-000000000002';
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0].value;
const snapshot = (workspace = wsA) => one('select public.gateway_fetch_workspace_runtime($1) as value', [workspace]);
const bundle = (workspace = wsA, key = keyA, includeWorkspace = true, includeCatalog = true, model = 'lab/model', endpoint = 'responses') => one(
    'select public.gateway_fetch_request_context_bundle_v2($1,$2,$3,$4,$5,$6) as value',
    [workspace, model, endpoint, key, includeCatalog, includeWorkspace]);

try {
    await db.exec(await readFile(new URL('./fixtures/context-bundle-before.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../migrations/20260916121303_gateway_context_bundle.sql', import.meta.url), 'utf8'));
    const migration = await readFile(new URL('../migrations/20260923221019_gateway_workspace_runtime_snapshot.sql', import.meta.url), 'utf8');
    const legacyBefore = await one("select pg_get_functiondef('public.gateway_fetch_request_context_bundle(uuid,text,text,uuid,boolean)'::regprocedure) as value");
    await db.exec(migration);
    await db.exec(migration);
    assert.equal(await one("select pg_get_functiondef('public.gateway_fetch_request_context_bundle(uuid,text,text,uuid,boolean)'::regprocedure) as value"), legacyBefore);
    await db.exec(`
        alter table public.byok_keys add column enc_value text;
        alter table public.workspace_settings add column future_secret text;
        insert into public.workspaces(id,billing_mode,tier,created_at) values
          ('${wsA}','wallet','basic',now()),('${wsB}','invoice',null,now());
        insert into public.workspace_settings(workspace_id,routing_mode,privacy_zdr_only,future_secret,gateway_plugins) values
          ('${wsA}','balanced',true,'private-setting','{"secret":"private-plugin"}'),('${wsB}','price',false,null,null);
        insert into public.keys(id,workspace_id,status,soft_blocked,daily_limit_requests,created_at) values
          ('${keyA}','${wsA}','active',false,0,now()),('${keyB}','${wsB}','active',false,0,now());
        insert into public.wallets(workspace_id,balance_nanos,reserved_nanos) values
          ('${wsA}',5000000000,2000000000),('${wsB}',8000000000,0);
        insert into public.v2_models(model_slug,status,hidden,input_modalities,output_modalities) values
          ('lab/model','active',false,array['text'],array['text']);
        insert into public.byok_keys(id,workspace_id,provider_id,enabled,fingerprint_sha256,key_version,always_use,enc_value) values
          ('60000000-0000-4000-8000-000000000002','${wsA}','test',true,'a-2',2,false,'ciphertext-a'),
          ('60000000-0000-4000-8000-000000000001','${wsA}','test',true,'a-1',1,true,'ciphertext-a'),
          ('60000000-0000-4000-8000-000000000003','${wsA}','test',false,'disabled',3,true,'disabled-secret'),
          ('60000000-0000-4000-8000-000000000004','${wsB}','test',true,'b',1,false,'ciphertext-b');
    `);
    for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`);
        await assert.rejects(snapshot(), /permission denied/);
        await assert.rejects(bundle(), /permission denied/);
        await assert.rejects(bundle(wsA, keyA, false, false), /permission denied/);
        await db.exec('reset role');
    }
    const security = await db.query(`select proname,prosecdef,proconfig from pg_proc where proname in
        ('gateway_fetch_workspace_runtime','gateway_fetch_request_context_bundle_v2')`);
    assert.equal(security.rows.length, 2);
    for (const row of security.rows) {
        assert.equal(row.prosecdef, false);
        assert.deepEqual(row.proconfig, ['search_path=""']);
    }
    await db.exec('set role service_role');
    const a = await snapshot();
    const b = await snapshot(wsB);
    assert.deepEqual(workspaceRuntimeSchema.parse(a), a);
    assert.deepEqual(workspaceRuntimeSchema.parse(b), b);
    assert.equal(a.configuredTier, 'basic');
    assert.equal(b.configuredTier, null);
    assert.equal(a.billingMode, 'wallet');
    assert.equal(b.billingMode, 'invoice');
    assert.equal(a.settings.routing_mode, 'balanced');
    assert.equal(b.settings.routing_mode, 'price');
    assert.equal(a.expiresAtMs - a.checkedAtMs, 60_000);
    assert.ok(Math.abs(a.checkedAtMs - Date.now()) < 5000);
    assert.deepEqual(a.byok.test.map(item => item.fingerprint_sha256), ['a-1', 'a-2']);
    assert.deepEqual(b.byok.test.map(item => item.fingerprint_sha256), ['b']);
    for (const forbidden of ['ciphertext', 'disabled', 'private-setting', 'private-plugin', 'future_secret', 'gateway_plugins',
        'balance_nanos', 'credit_ok', 'key_limit_ok', keyA, keyB, wsB]) {
        assert.ok(!JSON.stringify(a).includes(forbidden), forbidden);
    }
    const fresh = await bundle();
    assert.deepEqual(workspaceRuntimeSchema.parse(fresh.workspaceRuntime), fresh.workspaceRuntime);
    assert.equal(fresh.context.workspace_id, wsA);
    assert.equal(fresh.context.credit_ok.balance_nanos, 3_000_000_000);
    assert.equal(fresh.catalog.variants.length, 2);
    assert.equal((await bundle(wsA, keyA, false)).workspaceRuntime, null);
    assert.equal((await bundle(wsA, keyA, true, false)).catalog, null);
    for (const includeWorkspace of [true, false]) {
        await assert.rejects(bundle(wsB, keyA, includeWorkspace, false), /api_key_wrong_team/);
    }
    await db.query("update public.keys set status='disabled' where id=$1", [keyA]);
    await assert.rejects(bundle(wsA, keyA, false, false), /api_key_inactive/);
    await db.query("update public.keys set status='active' where id=$1", [keyA]);
    await db.query('update public.wallets set reserved_nanos=4000000000 where workspace_id=$1', [wsA]);
    assert.equal((await bundle(wsA, keyA, false, false)).context.credit_ok.balance_nanos, 1_000_000_000);
    await db.query('insert into public.test_budget_status values ($1,$2)', [wsA, {ok:true,budgets:[{id:'configured',limit_nanos:1000}]}]);
    assert.equal((await bundle(wsA, keyA, false, false)).context.key_limit_ok.budgets.length, 1);
    await db.query('update public.test_budget_status set status=$2 where workspace_id=$1', [wsA, {ok:false,reason:'workspace_budget_exceeded',budgets:[{id:'configured'}]}]);
    assert.equal((await bundle(wsA, keyA, false, false)).context.key_limit_ok.reason, 'workspace_budget_exceeded');
    await db.query('delete from public.test_budget_status where workspace_id=$1', [wsA]);
    await db.query('update public.keys set daily_limit_requests=1 where id=$1', [keyA]);
    await db.query('insert into public.gateway_requests(workspace_id,key_id,created_at,success,cost_nanos) values ($1,$2,now(),true,1)', [wsA,keyA]);
    assert.equal((await bundle(wsA, keyA, false, false)).context.key_limit_ok.reason, 'daily_request_limit_reached');
    await db.query('update public.byok_keys set enabled=false where workspace_id=$1', [wsA]);
    assert.deepEqual((await snapshot()).byok, {});
    assert.equal((await snapshot(wsB)).byok.test.length, 1);
    await db.query("update public.workspace_settings set routing_mode='price' where workspace_id=$1", [wsA]);
    assert.equal((await snapshot()).settings.routing_mode, 'price');
    await assert.rejects(snapshot(null), /missing_workspace_id/);
    await assert.rejects(snapshot('10000000-0000-4000-8000-000000000099'), /workspace_context_enrichment_missing/);
    for (const [model, endpoint] of [[null,'responses'],['','responses'],['x'.repeat(513),'responses'],['@private','responses'],['lab/model',null],['lab/model','embeddings']]) {
        await assert.rejects(bundle(wsA, keyA, false, false, model, endpoint), /unsupported_context_bundle/);
    }
    await assert.rejects(bundle(wsA, keyA, null, false), /unsupported_context_bundle/);
    await assert.rejects(bundle(wsA, keyA, false, null), /unsupported_context_bundle/);
    // Omitting cached workspace data avoids its source queries, not admission.
    await db.query('delete from public.workspace_settings where workspace_id=$1', [wsA]);
    assert.equal((await bundle(wsA, keyA, false, false)).context.workspace_id, wsA);
    await assert.rejects(bundle(), /workspace_context_enrichment_missing/);
    console.log('Workspace runtime SQL: schema parity, leases, redaction, role/tenant/key isolation, authoritative admission, optional payloads, migration idempotence and legacy preservation passed.');
} finally { await db.close(); }
