import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url), wrangler = createRequire(require.resolve("wrangler/package.json"));
const { build } = wrangler("esbuild"), { Miniflare } = wrangler("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({ absWorkingDir: root, bundle: true, format: "esm", platform: "browser", write: false,
    external: ["cloudflare:workers", "node:async_hooks"], stdin: { resolveDir: root, loader: "ts", contents: `
        import { AsyncLocalStorage } from 'node:async_hooks';
        export { RoutingHealthDurableObject } from './src/core/routing-health-durable-object';
        import { HealthBatcher } from './src/pipeline/execute/health-batcher';
        const batcher = new HealthBatcher(), scope = new AsyncLocalStorage(), owners = [], expectedOwners = []; let rpc = 0;
        export default { async fetch(request, env, ctx) {
            return scope.run(new URL(request.url).searchParams.get('id'), async () => {
            const stub = env.HEALTH.get(env.HEALTH.idFromName('test'));
            if (new URL(request.url).pathname === '/inspect') return Response.json({ stats: batcher.stats(), rpc, owners, expectedOwners, snapshot: await stub.getSnapshot() });
            const now = Date.now();
            const event = { id: new URL(request.url).searchParams.get('id'), endpoint: 'responses', model: 'm', provider: 'p',
                observedAt: now, startedAt: now - 100, ok: true, limited: false, probe: false, latencyMs: 100, tps: 10 };
            if (batcher.stats().queued === 0) expectedOwners.push(scope.getStore());
            const pending = batcher.enqueue('pool', event, async events => {
                owners.push(scope.getStore());
                rpc++;
                try { return await env.HEALTH.get(env.HEALTH.idFromName('test')).observeBatch(events); }
                catch (error) { console.warn('local_batch_rpc_failed', error.message); throw error; }
            });
            ctx.waitUntil(pending);
            return Response.json(await pending);
            });
        }};
    ` } });
const runtime = new Miniflare({ modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: "2025-10-01", compatibilityFlags: ["nodejs_als"], durableObjects: { HEALTH: { className: "RoutingHealthDurableObject", useSQLite: true } } });
try {
    for (let wave = 0; wave < 4; wave++) {
        const results = await Promise.all(Array.from({ length: 32 }, async (_, n) => {
            const response = await runtime.dispatchFetch(`https://local.invalid/report?id=${wave}-${n}`);
            assert.equal(response.status, 200, response.status === 200 ? undefined : await response.text());
            return response.json();
        }));
        assert(results.every(result => result?.health && result?.generation));
        const state = await (await runtime.dispatchFetch("https://local.invalid/inspect")).json();
        assert.equal(state.rpc, wave + 1); assert.equal(state.snapshot.providers.p.observations, (wave + 1) * 32);
        assert.deepEqual(state.owners, state.expectedOwners, "Full-batch RPC stays in the originating request context");
        assert.equal(state.stats.active, 0);
    }
    await (await runtime.dispatchFetch("https://local.invalid/report?id=sparse")).json();
    const state = await (await runtime.dispatchFetch("https://local.invalid/inspect")).json();
    assert.equal(state.rpc, 5); assert.equal(state.snapshot.providers.p.observations, 129);
    assert.deepEqual(state.owners, state.expectedOwners, "Sparse RPC stays in the originating request context");
    assert.equal(state.stats.active, 0); assert.equal(state.stats.queued, 0);
    console.log(JSON.stringify({ result: "PASS", waves: 4, concurrentRequests: 32, batchRpcsPerWave: 1, sparseRequestRpcs: 1,
        crossRequestIoErrors: 0, pendingBatches: 0, kvBinding: false }));
} finally { await runtime.dispose(); }
