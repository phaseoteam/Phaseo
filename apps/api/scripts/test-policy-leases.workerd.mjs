import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url), runtimeRequire = createRequire(require.resolve("wrangler/package.json"));
const { build } = runtimeRequire("esbuild"), { Miniflare } = runtimeRequire("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({ absWorkingDir: root, bundle: true, format: "esm", platform: "browser", write: false, external: ["node:*"],
    plugins: [{ name: "owned-test-source", setup(build) {
        build.onResolve({ filter: /^@\/runtime\/env$/ }, () => ({ path: "test-env", namespace: "policy-test" }));
        build.onLoad({ filter: /.*/, namespace: "policy-test" }, () => ({ loader: "ts", contents: `
            import { AsyncLocalStorage } from 'node:async_hooks';
            const runtime = new AsyncLocalStorage();
            export const run = (env, ctx, callback) => runtime.run({ env, ctx }, callback);
            export const dispatchBackground = promise => runtime.getStore().ctx.waitUntil(promise);
            export const getCache = () => {
                const origin = runtime.getStore().env.ORIGIN;
                return { get: async key => (await origin.fetch('https://source/kv/' + encodeURIComponent(key))).json(),
                    put: async (key, value) => { const response = await origin.fetch('https://source/kv/' + encodeURIComponent(key), { method: 'PUT', body: value }); await response.text(); } };
            };
            export const getSupabaseAdmin = () => {
                const origin = runtime.getStore().env.ORIGIN;
                return { from(table) {
                    const load = async () => (await origin.fetch('https://source/db/' + table)).json();
                    const query = { select: () => query, eq: () => query, maybeSingle: load,
                        then: (yes, no) => load().then(yes, no) };
                    return query;
                } };
            };
        ` }));
    } }], stdin: { resolveDir: root, loader: "ts", contents: `
        import { fetchWorkspacePolicy, bumpWorkspacePolicyVersion } from './src/pipeline/before/workspacePolicy';
        import { run } from '@/runtime/env';
        export default { fetch(request, env, ctx) { return run(env, ctx, async () => {
            if (new URL(request.url).pathname === '/bump') await bumpWorkspacePolicyVersion('workspace-a');
            return Response.json(await fetchWorkspacePolicy({ workspaceId: 'workspace-a', apiKeyId: 'key-a' }));
        }); } };
    ` } });
const counts = { kv: 0, db: 0, put: 0 }, values = new Map(); let restricted = false;
const runtime = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: "2025-10-01", compatibilityFlags: ["nodejs_compat"],
    serviceBindings: { ORIGIN: async request => {
        const path = new URL(request.url).pathname;
        if (path.startsWith("/kv/")) {
            const key = decodeURIComponent(path.slice(4));
            if (request.method === "PUT") { counts.put++; values.set(key, await request.text()); return new Response("ok"); }
            counts.kv++; await new Promise(resolve => setTimeout(resolve, 10)); return Response.json(values.get(key) ?? null);
        }
        counts.db++; await new Promise(resolve => setTimeout(resolve, 10));
        return Response.json({ data: path === "/db/workspace_settings" && restricted
            ? { model_restriction_mode: "blocklist", model_restriction_model_ids: ["blocked/model"] } : null, error: null });
    } } });
try {
    const result = await Promise.all(Array.from({ length: 32 }, () => runtime.dispatchFetch("https://policy.example/read").then(response => response.json())));
    assert.ok(result.every(value => value.blockedApiModels === null));
    assert.deepEqual(counts, { kv: 3, db: 4, put: 1 });
    await (await runtime.dispatchFetch("https://policy.example/read")).json();
    assert.deepEqual(counts, { kv: 3, db: 4, put: 1 });
    restricted = true;
    const changed = await (await runtime.dispatchFetch("https://policy.example/bump")).json();
    assert.deepEqual(changed.blockedApiModels, ["blocked/model"]);
    console.log(JSON.stringify({ result: "PASS", concurrentRequests: 32, refill: { kv: 3, db: 4, put: 1 }, warmExternalOperations: 0, mutationObserved: true }));
} finally { await runtime.dispose(); }
