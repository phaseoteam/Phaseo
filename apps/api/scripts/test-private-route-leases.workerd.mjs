import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url), runtimeRequire = createRequire(require.resolve("wrangler/package.json"));
const { build } = runtimeRequire("esbuild"), { Miniflare } = runtimeRequire("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({ absWorkingDir: root, bundle: true, format: "esm", platform: "browser", write: false, external: ["node:*"],
    plugins: [{ name: "owned-test-source", setup(build) {
        build.onResolve({ filter: /^@\/runtime\/env$/ }, () => ({ path: "test-env", namespace: "private-test" }));
        build.onLoad({ filter: /.*/, namespace: "private-test" }, () => ({ loader: "ts", contents: `
            import { AsyncLocalStorage } from 'node:async_hooks';
            const runtime = new AsyncLocalStorage();
            export const run = (env, ctx, callback) => runtime.run({ env, ctx }, callback);
            export const dispatchBackground = promise => runtime.getStore().ctx.waitUntil(promise);
            export const getCache = () => {
                const origin = runtime.getStore().env.ORIGIN;
                return { get: async key => (await origin.fetch('https://source/kv/' + encodeURIComponent(key))).json(),
                    put: async (key, value) => { await (await origin.fetch('https://source/kv/' + encodeURIComponent(key), { method: 'PUT', body: value })).text(); },
                    delete: async key => { await (await origin.fetch('https://source/kv/' + encodeURIComponent(key), { method: 'DELETE' })).text(); } };
            };
            export const getSupabaseAdmin = () => {
                const origin = runtime.getStore().env.ORIGIN;
                return { from() {
                    let workspace;
                    const load = async () => (await origin.fetch('https://source/db/' + workspace)).json();
                    const query = { select: () => query, eq: (key, value) => { if (key === 'workspace_id') workspace = value; return query; },
                        limit: load, maybeSingle: async () => { const result = await load(); return { ...result, data: result.data[0] ?? null }; } };
                    return query;
                } };
            };
        ` }));
    } }], stdin: { resolveDir: root, loader: "ts", contents: `
        import { loadPrivateRouteRow, invalidatePrivateRoutes, privateRouteCacheStats } from './src/pipeline/before/privateModelCache';
        import { run } from '@/runtime/env';
        export default { fetch(request, env, ctx) { return run(env, ctx, async () => {
            const [action, workspaceId] = new URL(request.url).pathname.slice(1).split('/');
            if (action === 'stats') return Response.json(privateRouteCacheStats());
            if (action === 'invalidate') await invalidatePrivateRoutes(workspaceId, { requirePublication: true });
            return Response.json(await loadPrivateRouteRow({ workspaceId, model: 'private/model' }));
        }); } };
    ` } });
const counts = { kv: 0, db: 0, put: 0, delete: 0 }, values = new Map(); let enabled = true;
const runtime = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: "2025-10-01", compatibilityFlags: ["nodejs_compat"],
    serviceBindings: { ORIGIN: async request => {
        const path = new URL(request.url).pathname;
        if (path.startsWith("/kv/")) {
            const key = decodeURIComponent(path.slice(4));
            if (request.method === "PUT") { counts.put++; values.set(key, await request.text()); return new Response("ok"); }
            if (request.method === "DELETE") { counts.delete++; values.delete(key); return new Response("ok"); }
            counts.kv++; await new Promise(resolve => setTimeout(resolve, 10)); return Response.json(values.get(key) ?? null);
        }
        counts.db++; await new Promise(resolve => setTimeout(resolve, 10));
        const workspaceId = path.slice(4);
        const rows = enabled ? [{ id: 'private-1', workspace_id: workspaceId, model_id: 'private/model', enc_value: 'ciphertext', upstream_model_id: 'old' }] : [];
        return Response.json({ data: rows, count: rows.length, error: null });
    } } });
try {
    const result = await Promise.all(Array.from({ length: 32 }, () => runtime.dispatchFetch("https://private.example/read/workspace-a").then(response => response.json())));
    assert.ok(result.every(value => value.workspace_id === "workspace-a" && value.enc_value === "ciphertext"));
    assert.deepEqual(counts, { kv: 1, db: 1, put: 1, delete: 0 });
    await (await runtime.dispatchFetch("https://private.example/read/workspace-a")).json();
    assert.deepEqual(counts, { kv: 1, db: 1, put: 1, delete: 0 });
    enabled = false;
    assert.equal(await (await runtime.dispatchFetch("https://private.example/invalidate/workspace-a")).json(), null);
    const stats = await (await runtime.dispatchFetch("https://private.example/stats")).json();
    assert.equal(stats.pending, 0); assert.equal(stats.exactReads, 0);
    console.log(JSON.stringify({ result: "PASS", concurrentRequests: 32, refill: { kv: 1, db: 1, put: 1 }, warmExternalOperations: 0, deletionObserved: true, stats }));
} finally { await runtime.dispose(); }
