import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve("wrangler/package.json"));
const { build } = wranglerRequire("esbuild");
const { Miniflare } = wranglerRequire("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({ absWorkingDir: root, bundle: true, format: "esm", platform: "browser", write: false,
    external: ["node:async_hooks"], stdin: { resolveDir: root, loader: "ts", contents: `
        import { SharedDiscoveryCache } from './src/routes/v1/control/shared-discovery-cache';
        import { RequestOperations, withRequestOperations, currentRequestOperations } from './src/runtime/request-operations';
        let loads = 0;
        const discovery = new SharedDiscoveryCache(() => caches.default, () => 'https://discovery.example', work => {
            currentRequestOperations().track(work);
        });
        export default { async fetch(request) {
            if (new URL(request.url).pathname === '/clear') { discovery.clearMemory(); return new Response('ok'); }
            const operations = new RequestOperations();
            return withRequestOperations(operations, async () => {
                const response = await discovery.response('providers:50:0', async () => {
                    loads++;
                    return { body: { ok: true, providers: [{ api_provider_id: 'fixture' }] } };
                });
                await operations.drain();
                return Response.json({ body: await response.json(), headers: Object.fromEntries(response.headers),
                    operations: operations.total, stats: discovery.stats(), loads });
            });
        }};
    ` } });
const runtime = new Miniflare({ modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: "2025-10-01", compatibilityFlags: ["nodejs_als"] });
const read = () => runtime.dispatchFetch("https://untrusted-host.example/read").then(response => response.json());
try {
    const cold = await read();
    assert.equal(cold.loads, 1);
    assert.equal(cold.operations.cacheRead, 1);
    assert.equal(cold.operations.cacheWrite, 1);
    await (await runtime.dispatchFetch("https://discovery.example/clear")).text();
    const burst = await Promise.all(Array.from({ length: 32 }, read));
    for (const result of burst) {
        assert.equal(result.body.providers[0].api_provider_id, "fixture");
        assert.equal(result.loads, 1);
        assert.equal(result.headers.vary, "Authorization");
        assert.match(result.headers["cache-control"], /^private, max-age=/);
    }
    assert.equal(burst.reduce((sum, row) => sum + (row.operations.cacheRead ?? 0), 0), 1);
    const warm = await read();
    assert.deepEqual(warm.operations, {});
    assert.equal(warm.stats.pending, 0);
    assert.equal(warm.stats.writes, 0);
    console.log(JSON.stringify({ result: "PASS", concurrentRequests: 32, sourceLoads: 1, burstCacheReads: 1, warmExternalOperations: 0 }));
} finally { await runtime.dispose(); }
