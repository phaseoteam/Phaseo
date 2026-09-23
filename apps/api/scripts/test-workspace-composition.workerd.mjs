import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url), runtimeRequire = createRequire(require.resolve("wrangler/package.json"));
const { build } = runtimeRequire("esbuild"), { Miniflare } = runtimeRequire("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({ absWorkingDir: root, bundle: true, format: "esm", platform: "browser", write: false, external: ["node:*"],
    plugins: [{ name: "isolated-control-plane", setup(build) {
        build.onResolve({ filter: /^@\/runtime\/env$/ }, () => ({ path: "env", namespace: "fixture" }));
        build.onResolve({ filter: /^@\/core\/feature-flags$/ }, () => ({ path: "flags", namespace: "fixture" }));
        build.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ loader: "ts", contents: path === "flags"
            ? "export const isDataContributionAccessEnabled = async () => false;"
            : `import { AsyncLocalStorage } from 'node:async_hooks';
               export const scope = new AsyncLocalStorage();
               export const getBindingsIfConfigured = () => ({});
               export const getCache = () => {
                   const store = scope.getStore().STORE;
                   return {get:async key => {const response = await store.fetch('https://store/'+key);return response.status===404?null:response.body;},
                       put:async(key,value)=>{await (await store.fetch('https://store/'+key,{method:'PUT',body:value})).text();}};
               };
               export const getSupabaseAdmin = () => ({rpc: async (_, args) => ({data: await (await scope.getStore().SOURCE.fetch('https://source/'+args.p_workspace_id)).json(),error:null})});` }));
    }}],
    stdin: { resolveDir: root, loader: "ts", contents: `
        import { scope } from '@/runtime/env';
        import { workspaceRuntimeCache, refillWorkspaceRuntime } from './src/pipeline/before/workspaceRuntime';
        import { composeWorkspaceRuntime } from './src/pipeline/before/workspaceRuntimeContext';
        import { splitContextForCache } from './src/pipeline/before/context.shared';
        export default {fetch(request, env) {return scope.run(env, async () => {
            const [workspace,version] = new URL(request.url).pathname.slice(1).split('/');
            let snapshot = await workspaceRuntimeCache.read(workspace, version);
            if (!snapshot) {
                snapshot = await refillWorkspaceRuntime(workspace, version);
                await workspaceRuntimeCache.publish(snapshot, workspace, version);
            }
            const context = await composeWorkspaceRuntime({workspaceId:workspace,key:{ok:false},keyLimit:{ok:false},credit:{ok:false},pricing:{},
                providers:[{providerId:'test',providerModelSlug:'model',supportsEndpoint:true,baseWeight:1,byokMeta:[]}]}, snapshot);
            const parts = splitContextForCache(context, {separateWorkspace:true});
            return Response.json({context,parts,stats:workspaceRuntimeCache.stats()});
        });}};
    ` } });
// Keep exact schema parity with the Worker instead of manually duplicating keys.
const { workspaceRuntimeSettingsSchema } = await import("../src/pipeline/before/workspaceRuntimeSnapshot.ts");
const counts = { sourceReads: 0, kvReads: 0, kvWrites: 0 }, values = new Map();
const runtime = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: "2025-10-01", compatibilityFlags: ["nodejs_compat"],
    serviceBindings: {
        SOURCE: async request => {
            counts.sourceReads++; await new Promise(resolve => setTimeout(resolve, 30));
            const workspaceId = new URL(request.url).pathname.slice(1);
            return Response.json({ version: 1, workspaceId, checkedAtMs: Date.now(), expiresAtMs: Date.now() + 60_000,
                configuredTier: "enterprise", billingMode: "wallet",
                settings: Object.fromEntries(Object.keys(workspaceRuntimeSettingsSchema.shape).map(key => [key, null])),
                byok: {test:[{provider_id:"test",id:"20000000-0000-4000-8000-000000000001",fingerprint_sha256:workspaceId,key_version:1,always_use:true}]} });
        },
        STORE: async request => {
            const key = new URL(request.url).pathname;
            if (request.method === "PUT") { counts.kvWrites++; values.set(key, await request.text()); return new Response("ok"); }
            counts.kvReads++; return values.has(key) ? new Response(values.get(key)) : new Response(null, { status: 404 });
        },
    },
});
const workspace = "10000000-0000-4000-8000-000000000001", other = "10000000-0000-4000-8000-000000000002";
const call = async id => {
    const response = await runtime.dispatchFetch(`https://fixture/${id}/v1`);
    assert.equal(response.status, 200); return response.json();
};
try {
    const burst = await Promise.all(Array.from({ length: 32 }, () => call(workspace)));
    assert.equal(counts.sourceReads, 1); assert.equal(counts.kvReads, 1); assert.equal(counts.kvWrites, 1);
    const baseline = { ...counts };
    for (let i = 0; i < 20; i++) await call(workspace);
    assert.deepEqual(counts, baseline);
    for (const value of burst) {
        assert.equal(value.context.key.ok, false); assert.equal(value.context.credit.ok, false);
        assert.equal(value.context.providers[0].byokMeta[0].fingerprintSha256, workspace);
        assert.equal(value.parts.static.providers[0].byokMeta.length, 0);
        assert.equal(value.parts.dynamic.teamSettings, undefined);
        assert.equal(value.parts.static.workspaceRuntimeExpiresAt, undefined);
    }
    const isolated = await call(other);
    assert.equal(isolated.context.providers[0].byokMeta[0].fingerprintSha256, other);
    assert.equal(isolated.stats.pending, 0); assert.equal(isolated.stats.writes, 0);
    console.log(JSON.stringify({ result: "PASS", concurrentRequests: 32, coalescedSourceReads: 1, warmExternalOperations: 0,
        admissionPreserved: true, privateConfigurationSeparated: true, tenantIsolation: true, counts }));
} finally { await runtime.dispose(); }
