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
        import { PublicCatalogCache } from './src/pipeline/before/publicCatalogCache';
        import { RequestOperations, withRequestOperations } from './src/runtime/request-operations';
        const cache = new PublicCatalogCache(() => caches.default, () => 'https://catalog.example');
        export default { async fetch(request) {
            const path = new URL(request.url).pathname;
            const operations = new RequestOperations();
            return withRequestOperations(operations, async () => {
                if (path === '/publish') {
                    const now = Date.now();
                    return Response.json({ published: await cache.publish({ version: 1, model: 'lab/model', resolvedModel: 'lab/model',
                        endpoints: ['text.generate'], checkedAt: now, expiresAt: now + 300_000,
                        variants: [{ endpoint: 'text.generate', providers: [{ provider_id: 'test', api_model_id: 'lab/model', byok_meta: [] }], pricing: {} }],
                        providerRows: [], routeModes: [] }) });
                }
                if (path === '/invalidate') { cache.invalidate('lab/model', ['text.generate']); return new Response('ok'); }
                const catalog = await cache.read('lab/model', ['text.generate']);
                return Response.json({ catalog, operations: operations.total, stats: cache.stats() });
            });
        }};
    ` } });
const runtime = new Miniflare({ modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: "2025-10-01", compatibilityFlags: ["nodejs_als"] });
try {
    const publish = await (await runtime.dispatchFetch("https://catalog.example/publish")).json();
    assert.equal(publish.published, true);
    // Discard only L1. The following requests must consume real Cache API bodies
    // in the originating request and share parsed data, not a Response/stream.
    await (await runtime.dispatchFetch("https://catalog.example/invalidate")).text();
    const results = await Promise.all(Array.from({ length: 32 }, () =>
        runtime.dispatchFetch("https://catalog.example/read").then(response => response.json())));
    for (const result of results) assert.equal(result.catalog?.model, "lab/model");
    assert.equal(results.reduce((sum, row) => sum + (row.operations.cacheRead ?? 0), 0), 1);
    const warm = await (await runtime.dispatchFetch("https://catalog.example/read")).json();
    assert.deepEqual(warm.operations, {});
    assert.equal(warm.stats.pending, 0);
    console.log(JSON.stringify({ result: "PASS", concurrentRequests: 32, cacheApiReads: 1, warmExternalOperations: 0 }));
} finally { await runtime.dispose(); }
