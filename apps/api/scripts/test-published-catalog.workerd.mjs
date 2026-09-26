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
        import { AsyncLocalStorage } from 'node:async_hooks';
        import { PublicCatalogCache } from './src/pipeline/before/publicCatalogCache';
        import { PublishedPublicCatalog } from './src/pipeline/before/publishedPublicCatalog';
        const requestContext = new AsyncLocalStorage();
        let shared, local, reads = 0, writes = 0;
        export default { async fetch(request, env, ctx) {
            shared ??= new PublishedPublicCatalog(() => ({
                get: (...args) => { reads++; return env.STORE.get(...args); },
                put: (...args) => { writes++; return env.STORE.put(...args); },
            }));
            local ??= new PublicCatalogCache(() => caches.default, () => 'https://reader.example', {
                read: (model, endpoints) => shared.read(model, endpoints),
                defer: work => requestContext.getStore().waitUntil(work),
            });
            return requestContext.run(ctx, async () => {
                const path = new URL(request.url).pathname;
                if (path === '/publish') {
                    const now = Date.now();
                    return Response.json({ published: await shared.publish({ version: 1, model: 'lab/model', resolvedModel: 'lab/model',
                        endpoints: ['text.generate'], checkedAt: now, expiresAt: now + 300_000,
                        variants: [{ endpoint: 'text.generate', providers: [{ provider_id: 'test', api_model_id: 'lab/model', byok_meta: [] }], pricing: {} }],
                        providerRows: [], routeModes: [] }, { model: 'lab/model', endpoints: ['text.generate'] }), reads, writes });
                }
                if (path === '/invalidate') { local.invalidate('lab/model', ['text.generate']); return new Response('ok'); }
                const catalog = await local.read('lab/model', ['text.generate']);
                return Response.json({ catalog, reads, writes, stats: local.stats() });
            });
        }};
    ` } });
const worker = name => ({ name, modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: "2025-10-01", compatibilityFlags: ["nodejs_als"], kvNamespaces: { STORE: "shared-catalog" } });
const runtime = new Miniflare({ workers: [worker("publisher"), worker("reader")] });
try {
    const publisher = await runtime.getWorker("publisher");
    const reader = await runtime.getWorker("reader");
    const publication = await (await publisher.fetch("https://publisher.example/publish")).json();
    assert.deepEqual(publication, { published: true, reads: 0, writes: 1 });
    const results = await Promise.all(Array.from({ length: 32 }, () =>
        reader.fetch("https://reader.example/read").then(response => response.json())));
    for (const result of results) {
        assert.equal(result.catalog?.model, "lab/model");
        assert.equal(result.reads, 1);
        assert.equal(result.writes, 0);
    }
    const warm = await (await reader.fetch("https://reader.example/read")).json();
    assert.equal(warm.reads, 1); assert.equal(warm.writes, 0); assert.equal(warm.stats.pending, 0);
    // Evict reader memory only: real Cache API should now serve the snapshot.
    await (await reader.fetch("https://reader.example/invalidate")).text();
    const edge = await (await reader.fetch("https://reader.example/read")).json();
    assert.equal(edge.catalog?.model, "lab/model");
    assert.equal(edge.reads, 1); assert.equal(edge.writes, 0);
    console.log(JSON.stringify({ result: "PASS", concurrentRequests: 32, coldKvReads: 1, requestKvWrites: 0 }));
} finally { await runtime.dispose(); }
