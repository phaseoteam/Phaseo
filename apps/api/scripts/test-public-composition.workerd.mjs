import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url), runtimeRequire = createRequire(require.resolve("wrangler/package.json"));
const { build } = runtimeRequire("esbuild"), { Miniflare } = runtimeRequire("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({ absWorkingDir: root, bundle: true, format: "esm", platform: "browser", write: false, external: ["node:*"],
    plugins: [{ name: "isolated-control-plane", setup(build) {
        build.onResolve({ filter: /^@\/runtime\/env$/ }, () => ({ path: "env", namespace: "fixture" }));
        build.onResolve({ filter: /^@\/core\/kv$/ }, () => ({ path: "kv", namespace: "fixture" }));
        build.onResolve({ filter: /workspacePolicy$/ }, () => ({ path: "policy", namespace: "fixture" }));
        build.onResolve({ filter: /privateModelCache$/ }, () => ({ path: "private", namespace: "fixture" }));
        build.onResolve({ filter: /^@\/core\/feature-flags$/ }, () => ({ path: "flags", namespace: "fixture" }));
        build.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ loader: "ts", contents: {
            flags: "export const isDataContributionAccessEnabled = async () => false;",
            policy: "export const getWorkspacePolicyVersionToken = async () => 'v0';",
            private: "export const loadPrivateRouteRow = async () => null;",
            kv: `import { getCache } from '@/runtime/env';
                export const keyVersionToken = async () => 'v0';
                export const getTextMany = async keys => Object.fromEntries(await Promise.all(keys.map(async key => {
                    const body = await getCache().get(key); return [key,body?await new Response(body).text():null];
                })));`,
            env: `import { AsyncLocalStorage } from 'node:async_hooks';
                export const scope = new AsyncLocalStorage();
                export const getByokKey = () => {throw new Error('Unexpected credential access');};
                export const getBindingsIfConfigured = () => ({GATEWAY_CONTEXT_BUNDLE_ENABLED:'true',GATEWAY_WORKSPACE_RUNTIME_ENABLED:'true',GATEWAY_PUBLIC_BASE_URL:'https://public.example'});
                export const dispatchBackground = promise => scope.getStore().background.push(promise);
                export const getCache = () => {
                    const store = scope.getStore().env.STORE;
                    return {get:async key => {const result=await store.fetch('https://store/'+key);return result.status===404?null:result.body;},
                        put:async(key,value)=>{await (await store.fetch('https://store/'+key,{method:'PUT',body:value})).text();}};
                };
                export const getSupabaseAdmin = () => ({from:()=>{throw new Error('Unexpected separate enrichment');},
                    rpc:async(name,args)=>(await scope.getStore().env.SOURCE.fetch('https://source/'+name,{method:'POST',body:JSON.stringify(args)})).json()});`,
        }[path] }));
    }}], stdin: { resolveDir: root, loader: "ts", contents: `
        import { scope } from '@/runtime/env';
        import { fetchGatewayContext } from './src/pipeline/before/context';
        import { RequestOperations, withRequestOperations } from './src/runtime/request-operations';
        export default {fetch(request,env) {return scope.run({env,background:[]},async()=>{
            const [workspace,model] = new URL(request.url).pathname.slice(1).split('/');
            const operations = new RequestOperations();
            return withRequestOperations(operations,async()=>{
                const value=await fetchGatewayContext({workspaceId:workspace,apiKeyId:workspace+'-key',model:'lab/'+model,endpoint:'text.generate'});
                await Promise.all(scope.getStore().background);
                return Response.json({value,operations:operations.total});
            });
        });}};
    ` } });
const { workspaceRuntimeSettingsSchema } = await import("../src/pipeline/before/workspaceRuntimeSnapshot.ts");
const counts = { admission: 0, catalog: 0, workspace: 0, kvReads: 0, kvWrites: 0 }, values = new Map();
const catalog = model => ({ version: 1, model, resolvedModel: model, checkedAt: Date.now(), expiresAt: Date.now() + 300_000,
    endpoints: ["text.generate"], providerRows: [{ provider_slug: "test", status: "active", routing_enabled: true }], routeModes: [],
    variants: [{ endpoint: "text.generate", providers: [{ provider_id: "test", api_model_id: model, provider_model_slug: model,
        model_status: "active", capability_status: "active", input_modalities: ["text"], output_modalities: ["text"], byok_meta: [] }],
        pricing: { test: { provider: "test", model, endpoint: "text.generate", currency: "USD", rules: [], effective_from: null, effective_to: null, version: "v1" } } }] });
const workspace = id => ({ version: 1, workspaceId: id, checkedAtMs: Date.now(), expiresAtMs: Date.now() + 60_000,
    configuredTier: "basic", billingMode: "wallet", byok: {},
    settings: Object.fromEntries(Object.keys(workspaceRuntimeSettingsSchema.shape).map(key => [key, null])) });
const runtime = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: "2025-10-01", compatibilityFlags: ["nodejs_compat"],
    serviceBindings: {
        SOURCE: async request => {
            const name = new URL(request.url).pathname.slice(1), args = await request.json();
            if (name === "gateway_fetch_public_catalog") {
                counts.catalog++; await new Promise(resolve => setTimeout(resolve, 30));
                return Response.json({ data: catalog(args.p_model), error: null });
            }
            if (name === "gateway_fetch_workspace_runtime") { counts.workspace++; return Response.json({ data: workspace(args.p_workspace_id), error: null }); }
            assert.equal(name, "gateway_fetch_request_context_bundle_v2"); counts.admission++;
            return Response.json({ data: { context: { workspace_id: args.workspace_id, resolved_model: args.model,
                key_ok: { ok: true }, key_limit_ok: { ok: true }, credit_ok: { ok: true, balance_nanos: 25_000_000_000 } },
                workspaceRuntime: args.include_workspace ? workspace(args.workspace_id) : null,
                catalog: args.include_catalog ? catalog(args.model) : null }, error: null });
        },
        STORE: async request => {
            const key = new URL(request.url).pathname;
            if (request.method === "PUT") { counts.kvWrites++; values.set(key, await request.text()); return new Response("ok"); }
            counts.kvReads++; return values.has(key) ? new Response(values.get(key)) : new Response(null, { status: 404 });
        },
    },
});
const first = "10000000-0000-4000-8000-000000000001", second = "10000000-0000-4000-8000-000000000002";
const call = async (id, model) => {
    const response = await runtime.dispatchFetch(`https://fixture/${id}/${model}`);
    const body = await response.text(); assert.equal(response.status, 200, body); return JSON.parse(body);
};
try {
    await call(first, "one");
    const original = new Map(values);
    await call(first, "two");
    assert.equal(counts.catalog, 1); assert.equal(counts.admission, 1);
    assert.deepEqual(values, original, "a new model must not rewrite or renew private admission/credit");
    await call(second, "one");
    assert.equal(counts.admission, 2); assert.equal(counts.catalog, 1);
    const baseline = { ...counts };
    const burst = await Promise.all(Array.from({ length: 32 }, (_, index) => call(index % 2 ? first : second, "three")));
    assert.equal(counts.catalog, baseline.catalog + 1);
    assert.equal(counts.admission, baseline.admission); assert.equal(counts.kvWrites, baseline.kvWrites);
    assert.equal(burst.reduce((sum, row) => sum + (row.operations.cacheWrite ?? 0), 0), 1);
    const warmBaseline = { ...counts };
    for (let i = 0; i < 20; i++) {
        const result = await call(first, "three");
        assert.deepEqual(result.operations, {}); assert.equal(result.value.credit.ok, true);
    }
    assert.deepEqual(counts, warmBaseline);
    assert.equal([...values.keys()].some(key => key.includes("gateway:static:")), false);
    for (const [key, raw] of values) if (key.includes("gateway:dynamic:")) {
        const value = JSON.parse(raw); assert.equal(value.providers, undefined); assert.equal(value.pricing, undefined);
        assert.equal(value.teamSettings, undefined);
    }
    console.log(JSON.stringify({ result: "PASS", concurrentRequests: 32, sharedModelSourceReads: 1, warmExternalOperations: 0,
        modelChangesRewriteAdmission: false, publicStaticKvCopies: 0, counts }));
} finally { await runtime.dispose(); }
