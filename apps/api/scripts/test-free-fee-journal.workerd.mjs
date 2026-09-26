import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url), wrangler = createRequire(require.resolve("wrangler/package.json"));
const { build } = wrangler("esbuild"), { Miniflare } = wrangler("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const identity = { workspaceId: "10000000-0000-4000-8000-000000000001", keyId: "20000000-0000-4000-8000-000000000001", requestId: "success" };
const bundle = await build({ absWorkingDir: root, bundle: true, format: "esm", platform: "browser", write: false,
    external: ["cloudflare:*", "node:*"], stdin: { resolveDir: root, loader: "ts", contents: `
        import { FreeModelQuotaDurableObject } from './src/core/free-model-quota-durable-object';
        export class JournalProbe extends FreeModelQuotaDurableObject {
            async inspect() {
                const exists = this.ctx.storage.sql.exec("SELECT name FROM sqlite_master WHERE name = 'free_fee_journal'").toArray().length;
                return { rows: exists ? this.ctx.storage.sql.exec('SELECT * FROM free_fee_journal').toArray() : [],
                    exists, alarm: await this.ctx.storage.getAlarm() };
            }
            async tick() {
                this.ctx.storage.sql.exec('UPDATE free_fee_journal SET due = 0 WHERE due IS NOT NULL');
                await this.alarm(); return this.inspect();
            }
            restart() { this.ctx.abort('fixture_restart'); }
            fill(count) {
                this.feeStatus();
                for(let i=0;i<count;i++) this.ctx.storage.sql.exec("INSERT INTO free_fee_journal VALUES (?, '{}', 'review', NULL, 0, NULL)", 'fixture-' + i);
            }
        }
        export default { async fetch(request, env) {
            const url = new URL(request.url), stub = env.QUOTA.getByName(url.searchParams.get('owner') ?? 'a');
            try {
                if(url.pathname === '/inspect') return Response.json(await stub.inspect());
                if(url.pathname === '/tick') return Response.json(await stub.tick());
                if(url.pathname === '/fill') { await stub.fill(Number(url.searchParams.get('count') ?? 128)); return Response.json({ok:true}); }
                if(url.pathname === '/restart') { try { await stub.restart(); } catch {} return Response.json({ok:true}); }
                if(url.pathname === '/admit') return Response.json(await stub.admit());
                const input = await request.json();
                return Response.json(url.pathname === '/prepare' ? await stub.prepareFee(input)
                    : await stub.finishFee(input, url.pathname.slice(1)));
            } catch(error) { return Response.json({ error: error.message }, {status:503}); }
        }};
    ` } });
const ledger = new Map(), calls = [], mutations = { holds: 0, captures: 0, releases: 0 };
let lost = false;
async function source(request) {
    const url = new URL(request.url); assert.equal(url.hostname, 'source.invalid');
    const input = await request.json(), fn = url.pathname.split('/').at(-1);
    calls.push({fn, id: input.p_reservation_id});
    const id = input.p_workspace_id + ':' + input.p_reservation_id;
    let state = ledger.get(id);
    if (fn === 'gateway_wallet_reserve_once') {
        if (input.p_reservation_id.endsWith(':denied')) return Response.json([{ ok:false, reason:'insufficient_balance' }]);
        if (!state) { state = 'held'; ledger.set(id, state); mutations.holds++; }
        if (input.p_reservation_id.endsWith(':reserve-lost')) return Response.json({message:'lost reservation reply'}, {status:504});
        return Response.json([{ok:true, applied:true, status:state, amount_nanos:100000}]);
    }
    assert.ok(['gateway_wallet_capture_once','gateway_wallet_release_once'].includes(fn));
    if (input.p_reservation_id.endsWith(':permanent')) return Response.json({message:'fixture'}, {status:503});
    const wanted = fn === 'gateway_wallet_capture_once' ? 'captured' : 'released';
    if (state !== 'held' && state !== wanted) return Response.json([{ok:false, reason:'reservation_not_active'}]);
    const already = state === wanted;
    if (!already) { ledger.set(id, wanted); mutations[wanted === 'captured' ? 'captures' : 'releases']++; }
    if (input.p_reservation_id.endsWith(':lost') && !lost) { lost = true; return Response.json({message:'lost confirmation'}, {status:504}); }
    return Response.json([{ok:true, applied:!already, already_applied:already, status:wanted, amount_nanos:100000}]);
}
const mf = new Miniflare({ modules:[{type:'ESModule',path:'journal.mjs',contents:bundle.outputFiles[0].text}], compatibilityDate:'2025-10-01', compatibilityFlags:['nodejs_als'],
    durableObjects:{ QUOTA:{className:'JournalProbe',useSQLite:true} }, kvNamespaces:['GATEWAY_CACHE'],
    bindings:{SUPABASE_URL:'https://source.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture'}, outboundService:source });
const call = async (path, requestId = 'success', overrides = {}) => (await mf.dispatchFetch('https://local.invalid' + path,
    {method:'POST', body:JSON.stringify({...identity,requestId,...overrides})})).json();
try {
    await call('/admit'); assert.deepEqual(await call('/inspect'), {rows:[],exists:0,alarm:null}); assert.equal(calls.length,0);
    assert.equal((await call('/prepare')).allowed,true);
    assert.equal((await call('/inspect')).rows[0].state,'held');
    assert.equal((await call('/capture')).settled,true);
    assert.equal((await call('/capture')).settled,true); assert.equal(mutations.captures,1);
    assert.equal((await call('/inspect')).alarm,null);
    await call('/prepare','failed'); assert.equal((await call('/release','failed')).settled,true); assert.equal(mutations.releases,1);
    await call('/prepare','lost'); assert.equal((await call('/capture','lost')).settled,false);
    assert.equal((await call('/inspect')).rows[0].outcome,'capture');
    assert.match((await call('/release','lost')).error,/outcome_conflict/);
    await call('/restart'); await call('/tick');
    assert.equal((await call('/inspect')).rows.length,0); assert.equal(mutations.captures,2);
    await call('/prepare','unknown'); await call('/restart');
    const beforeUnknown = calls.length; const unknown = await call('/tick');
    assert.equal(unknown.rows[0].state,'review'); assert.equal(unknown.alarm,null); assert.equal(calls.length,beforeUnknown);
    assert.match((await call('/prepare','unknown',{keyId:'20000000-0000-4000-8000-000000000002'})).error,/identity_conflict/);
    assert.equal((await call('/release','unknown')).settled,true);
    assert.equal((await call('/prepare','denied')).allowed,false); assert.equal((await call('/inspect')).rows.length,0);
    assert.ok((await call('/prepare','reserve-lost')).error);
    await call('/restart'); const pendingReserveCalls = calls.length;
    assert.equal((await call('/tick')).rows[0].state,'review'); assert.equal(calls.length,pendingReserveCalls);
    assert.equal((await call('/release','reserve-lost')).settled,true);
    await call('/prepare','permanent'); await call('/capture','permanent');
    for(let i=0;i<6;i++) await call('/tick');
    const permanent = await call('/inspect'); assert.equal(permanent.rows[0].attempts,5); assert.equal(permanent.rows[0].state,'review'); assert.equal(permanent.alarm,null);
    assert.equal(calls.filter(c=>c.fn==='gateway_wallet_capture_once' && c.id.endsWith(':permanent')).length,5);
    await call('/fill?owner=full'); const beforeFull = calls.length;
    assert.match((await call('/prepare?owner=full','overflow')).error,/capacity/); assert.equal(calls.length,beforeFull);
    assert.equal((await call('/inspect?owner=full')).rows.length,128);
    await call('/fill?owner=concurrent&count=127');
    const admissions = await Promise.all(Array.from({length:16}, (_,i)=>call('/prepare?owner=concurrent','race-'+i)));
    assert.equal(admissions.filter(a=>a.allowed).length,1); assert.equal((await call('/inspect?owner=concurrent')).rows.length,128);
    assert.equal((await call('/prepare?owner=other','isolated')).allowed,true);
    await call('/release?owner=other','isolated');
    console.log(JSON.stringify({result:'PASS',includedHasNoJournalOrAlarm:true,duplicateCaptureDebitsOnce:true,
        restartReplaysPersistedDecision:true,unknownOutcomeNeverCharged:true,maxAttempts:5,maxRetainedRows:128,mutations}));
} finally { await mf.dispose(); }
