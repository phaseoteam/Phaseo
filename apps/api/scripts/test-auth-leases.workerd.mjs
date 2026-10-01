import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve("wrangler/package.json"));
const { build } = wranglerRequire("esbuild");
const { Miniflare } = wranglerRequire("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({ absWorkingDir: root, bundle: true, format: "esm", platform: "browser", write: false,
    stdin: { resolveDir: root, loader: "ts", contents: `
        import { readAuthKey, readAuthKeySource, rememberAuthKey, readValidatedAuth, rememberValidatedAuth, authServingCacheStats } from './src/pipeline/before/auth-cache';
        import { coalesceKeyLastUsed } from './src/pipeline/before/auth-last-used';
        export default { async fetch(request, env, ctx) {
            const kid = new URL(request.url).pathname.slice(1);
            if (kid === 'stats') return Response.json(authServingCacheStats());
            const lease = readValidatedAuth(kid, 'v0');
            if (lease) return Response.json(lease);
            let row = await readAuthKey(kid, 'v0', async () => {
                const response = await env.ORIGIN.fetch('https://source.example/kv');
                return await response.json();
            });
            if (!row) {
                row = await readAuthKeySource(kid, 'v0', async () => {
                    const observed = Date.now();
                    const response = await env.ORIGIN.fetch('https://source.example/db/' + kid);
                    return { ...await response.json(), auth_source_at_ms: observed };
                });
                const text = rememberAuthKey(kid, 'v0', row);
                if (text) ctx.waitUntil(env.ORIGIN.fetch('https://source.example/put', { method: 'POST', body: text }).then(response => response.text()));
            }
            const touch = coalesceKeyLastUsed(row.id, async () => {
                const response = await env.ORIGIN.fetch('https://source.example/touch'); await response.text();
            });
            if (touch) ctx.waitUntil(touch);
            const result = { ok: true, apiKeyId: row.id, workspaceId: row.workspace_id, apiKeyKid: kid, apiKeyRef: kid };
            rememberValidatedAuth(kid, 'v0', row, result);
            return Response.json(result);
        }};
    ` } });
const counts = { kv: 0, db: 0, put: 0, touch: 0 };
const runtime = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: "2025-10-01",
    serviceBindings: { ORIGIN: async request => {
        const path = new URL(request.url).pathname;
        if (path === "/kv") { counts.kv++; await new Promise(resolve => setTimeout(resolve, 20)); return Response.json(null); }
        if (path.startsWith("/db/")) { counts.db++; await new Promise(resolve => setTimeout(resolve, 20));
            return Response.json({ id: path.slice(4), workspace_id: path.slice(4), status: "active", hash: "a".repeat(64) }); }
        if (path === "/put") { counts.put++; await request.text(); }
        if (path === "/touch") counts.touch++;
        return new Response("ok");
    } } });
try {
    const result = await Promise.all(Array.from({ length: 32 }, () => runtime.dispatchFetch("https://auth.example/key-a").then(response => response.json())));
    assert.ok(result.every(value => value.ok && value.workspaceId === "key-a"));
    assert.deepEqual(counts, { kv: 1, db: 1, put: 1, touch: 1 });
    await (await runtime.dispatchFetch("https://auth.example/key-a")).json();
    assert.deepEqual(counts, { kv: 1, db: 1, put: 1, touch: 1 });
    const separate = await (await runtime.dispatchFetch("https://auth.example/key-b")).json();
    assert.equal(separate.workspaceId, "key-b");
    assert.deepEqual(counts, { kv: 2, db: 2, put: 2, touch: 2 });
    const stats = await (await runtime.dispatchFetch("https://auth.example/stats")).json();
    assert.equal(stats.source.pending, 0); assert.equal(stats.rows.pending, 0);
    console.log(JSON.stringify({ result: "PASS", concurrentRequests: 32, coldRefill: { kv: 1, db: 1, put: 1, touch: 1 }, warmExternalOperations: 0, keyIsolation: true }));
} finally { await runtime.dispose(); }
