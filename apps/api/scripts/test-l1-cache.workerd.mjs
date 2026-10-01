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
        import { L1Cache } from './src/runtime/cache/l1';
        const cache = new L1Cache({ namespace: 'native', maxEntries: 4, maxBytes: 2048,
            maxEntryBytes: 1024, maxPending: 2, sizeOf: (value, key) => 2 * (JSON.stringify(value).length + key.length) });
        export default { async fetch(request, env) {
            const path = new URL(request.url).pathname;
            if (path === '/stats') return Response.json(cache.stats());
            const value = await cache.getOrLoad(path, async () => {
                const response = await env.ORIGIN.fetch('https://origin.example/data');
                // Consume the I/O in its creating request. Share only parsed data.
                const data = await response.json();
                return { value: data, expiresAtMs: Date.now() + 60_000 };
            });
            return Response.json(value);
        }};
    ` } });
let loads = 0;
const runtime = new Miniflare({ modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: "2025-10-01", serviceBindings: { ORIGIN: async () => {
        loads++;
        await new Promise(resolve => setTimeout(resolve, 40));
        return new Response(JSON.stringify({ version: "one", nested: { price: 0 } }));
    } } });
try {
    const results = await Promise.all(Array.from({ length: 32 }, () =>
        runtime.dispatchFetch("https://cache.example/shared").then(response => response.json())));
    assert.equal(loads, 1);
    results.forEach(result => assert.deepEqual(result, { version: "one", nested: { price: 0 } }));
    await (await runtime.dispatchFetch("https://cache.example/shared")).json();
    assert.equal(loads, 1);
    const stats = await (await runtime.dispatchFetch("https://cache.example/stats")).json();
    assert.equal(stats.pending, 0);
    assert.equal(stats.entries, 1);
    assert.ok(stats.coalesced > 0);
    console.log(JSON.stringify({ result: "PASS", concurrentRequests: 32, upstreamLoads: loads, stats }));
} finally { await runtime.dispose(); }
