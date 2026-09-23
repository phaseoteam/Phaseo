import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url), runtimeRequire = createRequire(require.resolve("wrangler/package.json"));
const { build } = runtimeRequire("esbuild"), { Miniflare } = runtimeRequire("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({ absWorkingDir:root,bundle:true,format:"esm",platform:"browser",write:false,external:["node:*"],
    stdin:{resolveDir:root,loader:"ts",contents:`
        import { AsyncLocalStorage } from 'node:async_hooks';
        import { WorkspaceRuntimeCache } from './src/pipeline/before/workspaceRuntimeCache';
        import { workspaceRuntimeSettingsSchema } from './src/pipeline/before/workspaceRuntimeSnapshot';
        const scope = new AsyncLocalStorage();
        const cache = new WorkspaceRuntimeCache(() => {
            const origin = scope.getStore().ORIGIN;
            return {get: async key => (await origin.fetch('https://source/'+encodeURIComponent(key))).json(),
                put: async (key, raw) => {await (await origin.fetch('https://source/'+encodeURIComponent(key),{method:'PUT',body:raw})).text();}};
        });
        const fixture = workspaceId => ({version:1,workspaceId,checkedAtMs:Date.now(),expiresAtMs:Date.now()+60000,
            configuredTier:null,billingMode:'wallet',byok:{},
            settings:Object.fromEntries(Object.keys(workspaceRuntimeSettingsSchema.shape).map(key => [key,null]))});
        export default {fetch(request,env) {return scope.run(env,async () => {
            const [action,workspace,version] = new URL(request.url).pathname.slice(1).split('/');
            if(action==='fixture') return Response.json(fixture(workspace));
            if(action==='stats') return Response.json(cache.stats());
            if(action==='publish') return Response.json(await cache.publish(fixture(workspace),workspace,version));
            return Response.json(await cache.read(workspace,version));
        });}};
    `}});
const values = new Map(), counts = {read:0,write:0};
const runtime = new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:"2025-10-01",compatibilityFlags:["nodejs_compat"],
    serviceBindings:{ORIGIN:async request => {
        const key = decodeURIComponent(new URL(request.url).pathname.slice(1));
        if(request.method === "PUT") {counts.write++;values.set(key,await request.text());return new Response("ok");}
        counts.read++;await new Promise(resolve => setTimeout(resolve,10));return Response.json(values.get(key)??null);
    }}});
const workspace = "10000000-0000-4000-8000-000000000001", other = "10000000-0000-4000-8000-000000000002";
const call = async path => (await runtime.dispatchFetch(`https://workspace.example/${path}`)).json();
try {
    const source = await call(`fixture/${workspace}`);
    values.set(`gateway:workspace-runtime:v1:${workspace}:v1`,JSON.stringify(source));
    const burst = await Promise.all(Array.from({length:32},() => call(`read/${workspace}/v1`)));
    assert.ok(burst.every(value => value.workspaceId===workspace));
    assert.deepEqual(counts,{read:1,write:0});
    for(let i=0;i<20;i++) await call(`read/${workspace}/v1`);
    assert.deepEqual(counts,{read:1,write:0});
    assert.equal(await call(`read/${other}/v1`),null);
    assert.equal(await call(`read/${workspace}/v2`),null);
    assert.equal(await call(`publish/${workspace}/v2`),true);
    assert.equal((await call(`read/${workspace}/v2`)).workspaceId,workspace);
    const expired = {...source,checkedAtMs:source.checkedAtMs-60001,expiresAtMs:source.checkedAtMs-1};
    values.set(`gateway:workspace-runtime:v1:${workspace}:v3`,JSON.stringify(expired));
    assert.equal(await call(`read/${workspace}/v3`),null);
    const stats = await call("stats");
    assert.equal(stats.pending,0);assert.equal(stats.writes,0);
    assert.ok(stats.entries<=128 && stats.bytes<=4*1024*1024);
    console.log(JSON.stringify({result:"PASS",concurrentRequests:32,coldKvReads:1,warmExternalOperations:0,
        tenantAndVersionIsolation:true,expiredSourceRejected:true,counts,stats}));
} finally {await runtime.dispose();}
