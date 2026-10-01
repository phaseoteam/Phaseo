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
        import { ContextLeaseCache } from './src/pipeline/before/contextLeaseCache';
        const cache = new ContextLeaseCache();
        export default { async fetch(request, env) {
            const workspace = new URL(request.url).pathname.slice(1);
            if (workspace === 'stats') return Response.json(cache.stats());
            const keys = ['gateway:dynamic:' + workspace, 'gateway:static:' + workspace];
            const values = await cache.read(keys, async missing => {
                const response = await env.ORIGIN.fetch('https://source.example', {
                    method: 'POST', body: JSON.stringify(missing),
                });
                return await response.json();
            });
            return Response.json(values);
        }};
    ` } });
let calls = 0, keysRead = 0;
const runtime = new Miniflare({ modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: "2025-10-01", serviceBindings: { ORIGIN: async request => {
        calls++;
        const keys = await request.json(); keysRead += keys.length;
        await new Promise(resolve => setTimeout(resolve, 40));
        const checkedAtMs = Date.now();
        return Response.json(Object.fromEntries(keys.map(key => [key, JSON.stringify({ key,
            cacheLease: { checkedAtMs, expiresAtMs: checkedAtMs + 60_000 },
        })])));
    } } });
try {
    const results = await Promise.all(Array.from({ length: 32 }, () =>
        runtime.dispatchFetch("https://cache.example/workspace-a").then(response => response.json())));
    assert.equal(calls, 1); assert.equal(keysRead, 2);
    for (const result of results) {
        assert.equal(Object.keys(result).length, 2);
        for (const [key, raw] of Object.entries(result)) assert.equal(JSON.parse(raw).key, key);
    }
    await (await runtime.dispatchFetch("https://cache.example/workspace-a")).json();
    assert.equal(calls, 1);
    const separate = await (await runtime.dispatchFetch("https://cache.example/workspace-b")).json();
    assert.equal(calls, 2); assert.equal(keysRead, 4);
    assert.ok(Object.keys(separate).every(key => key.endsWith("workspace-b")));
    const stats = await (await runtime.dispatchFetch("https://cache.example/stats")).json();
    assert.equal(stats.pending, 0); assert.equal(stats.entries, 4);
    console.log(JSON.stringify({ result: "PASS", concurrentRequests: 32, sameWorkspaceSourceCalls: 1,
        sameWorkspaceKeysRead: 2, warmSourceCalls: 0, workspaceIsolation: true, stats }));
} finally { await runtime.dispose(); }
