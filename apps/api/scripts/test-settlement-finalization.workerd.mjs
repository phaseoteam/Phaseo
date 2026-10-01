import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url), runtimeRequire = createRequire(require.resolve("wrangler/package.json"));
const { build } = runtimeRequire("esbuild"), { Miniflare } = runtimeRequire("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({ absWorkingDir: root, bundle: true, format: "esm", platform: "browser", write: false, external: ["node:*"],
    plugins: [{ name: "isolated-settlement", setup(build) {
        build.onResolve({ filter: /pricing\/persist$/ }, () => ({ path: "settlement", namespace: "fixture" }));
        build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ loader: "ts", contents: `
            import { AsyncLocalStorage } from 'node:async_hooks';
            export const scope = new AsyncLocalStorage();
            export const recordUsageAndCharge = async args => {
                const response=await scope.getStore().fetch('https://ledger/'+args.requestId,{method:'POST',body:JSON.stringify(args)});
                if(!response.ok)throw new Error('fixture_settlement_unavailable');
            };
        ` }));
    }}], stdin: { resolveDir: root, loader: "ts", contents: `
        import { scope } from './src/pipeline/pricing/persist';
        import { recordUsageAndChargeOnce } from './src/pipeline/after/charge';
        import { RequestOperations, withRequestOperations, currentRequestOperations } from './src/runtime/request-operations';
        export default {fetch(request,env){return scope.run(env.LEDGER,()=>withRequestOperations(new RequestOperations(),async()=>{
            const mode=new URL(request.url).pathname.slice(1);
            const ctx={requestId:'public',billingRequestId:mode,workspaceId:'fixture-workspace',meta:{},
                creditCacheWrites:[new Promise(resolve=>setTimeout(resolve,10))]};
            if(mode==='independent'){
                await Promise.all(Array.from({length:32},(_,index)=>recordUsageAndChargeOnce({
                    ctx:{...ctx,billingRequestId:'independent-'+index,meta:{}},costNanos:10,endpoint:'responses'})));
                return Response.json({independent:true});
            }
            await Promise.all(Array.from({length:32},()=>recordUsageAndChargeOnce({ctx:{...ctx},costNanos:10,endpoint:'responses'})));
            let conflict=false;
            if(mode==='success')try{await recordUsageAndChargeOnce({ctx,costNanos:20,endpoint:'responses'});}catch{conflict=true;}
            if(mode==='recover')await recordUsageAndChargeOnce({ctx,costNanos:10,endpoint:'responses'});
            if(mode==='retry-identity'){
                let conflicts=0;
                for(const changed of [{ctx:{...ctx,billingRequestId:'different'},costNanos:10},
                    {ctx:{...ctx,workspaceId:'other'},costNanos:10},{ctx,costNanos:20}]){
                    try{await recordUsageAndChargeOnce({...changed,endpoint:'responses'});}
                    catch(error){if(error.message==='settlement_identity_conflict')conflicts++;else throw error;}
                }
                await Promise.all(Array.from({length:32},()=>recordUsageAndChargeOnce({ctx:{...ctx},costNanos:10,endpoint:'responses'})));
                return Response.json({recorded:ctx.meta.__usageChargeRecorded===true,conflicts,metrics:currentRequestOperations().snapshot()});
            }
            return Response.json({recorded:ctx.meta.__usageChargeRecorded===true,conflict,metrics:currentRequestOperations().snapshot()});
        }));}};
    ` } });
const calls = new Map();
const committed = new Map();
const runtime = new Miniflare({ modules: [{ type: "ESModule", path: "settlement.mjs", contents: bundle.outputFiles[0].text }], compatibilityDate: "2025-10-01", compatibilityFlags: ["nodejs_compat"],
    serviceBindings: { LEDGER: async request => {
        const mode = new URL(request.url).pathname.slice(1), count = (calls.get(mode) ?? 0) + 1;
        calls.set(mode, count);
        const args = await request.json(); assert.equal(args.workspaceId, "fixture-workspace"); assert.equal(args.cost_nanos, 10);
        if (mode === "retry-identity") {
            // Model the first debit committing before three confirmations fail.
            // The fourth call is a replay, not a new ledger movement.
            const identity = `${args.workspaceId}:${args.requestId}`;
            if (!committed.has(identity)) committed.set(identity, args.cost_nanos);
            assert.equal(committed.get(identity), args.cost_nanos);
        }
        await new Promise(resolve => setTimeout(resolve, 10));
        return new Response("fixture", { status: mode.startsWith("independent-") || mode === "success" || (["recover", "retry-identity"].includes(mode) && count > 3) ? 200 : 503 });
    } },
});
const call = async mode => { const response = await runtime.dispatchFetch(`https://fixture/${mode}`); assert.equal(response.status, 200); return response.json(); };
try {
    const success = await call("success");
    assert.equal(calls.get("success"), 1, "concurrent finalizers must share one authoritative attempt");
    assert.equal(success.recorded, true); assert.equal(success.conflict, true);
    assert.deepEqual(success.metrics.settlement, { state: "confirmed", directAttempts: 1 });
    assert.deepEqual(success.metrics.total, {});
    const failed = await call("failure");
    assert.equal(calls.get("failure"), 3); assert.equal(failed.recorded, false);
    assert.deepEqual(failed.metrics.settlement, { state: "unresolved", directAttempts: 3 });
    const recovered = await call("recover");
    assert.equal(calls.get("recover"), 4); assert.equal(recovered.recorded, true);
    assert.deepEqual(recovered.metrics.settlement, { state: "confirmed", directAttempts: 4 });
    const retryIdentity = await call("retry-identity");
    assert.equal(retryIdentity.conflicts, 3);
    assert.equal(retryIdentity.recorded, true);
    assert.deepEqual(retryIdentity.metrics.settlement, { state: "confirmed", directAttempts: 4 });
    assert.equal(calls.get("retry-identity"), 4);
    assert.equal(calls.has("different"), false, "Changed billing identity must never reach the source");
    assert.equal(committed.size, 1, "Lost confirmations and concurrent re-entry retain one mocked debit");
    await call("independent");
    assert.equal([...calls.keys()].filter(key => key.startsWith("independent-")).length, 32);
    for (const [key, count] of calls) if (key.startsWith("independent-")) assert.equal(count, 1);
    console.log(JSON.stringify({ result: "PASS", concurrentFinalizers: 32, successfulAttempts: 1, failedAttempts: 3, recoveryAttempts: 4,
        independentSettlements: 32, conflictingAmountsRejected: true, exhaustedIdentityFence: true, realWalletOperations: 0 }));
} finally { await runtime.dispose(); }
