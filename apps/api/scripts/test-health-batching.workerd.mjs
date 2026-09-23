import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url), wrangler = createRequire(require.resolve("wrangler/package.json"));
const { build } = wrangler("esbuild"), { Miniflare } = wrangler("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({ absWorkingDir: root, bundle: true, format: "esm", platform: "browser", write: false,
    external: ["cloudflare:workers"], stdin: { resolveDir: root, loader: "ts", contents: `
        export { RoutingHealthDurableObject } from './src/core/routing-health-durable-object';
        import { HealthBatcher } from './src/pipeline/execute/health-batcher';
        const batcher = new HealthBatcher(); let rpc = 0;
        export default { async fetch(request, env, ctx) {
            const stub = env.HEALTH.get(env.HEALTH.idFromName('test'));
            if (new URL(request.url).pathname === '/inspect') return Response.json({ stats: batcher.stats(), rpc, snapshot: await stub.getSnapshot() });
            const now = Date.now();
            const event = { id: new URL(request.url).searchParams.get('id'), endpoint: 'responses', model: 'm', provider: 'p',
                observedAt: now, startedAt: now - 100, ok: true, limited: false, probe: false, latencyMs: 100, tps: 10 };
            const pending = batcher.enqueue('pool', event, async events => {
                rpc++;
                try { return await env.HEALTH.get(env.HEALTH.idFromName('test')).observeBatch(events); }
                catch (error) { console.warn('local_batch_rpc_failed', error.message); throw error; }
            });
            ctx.waitUntil(pending);
            return Response.json(await pending);
        }};
    ` } });
const runtime = new Miniflare({ modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: "2025-10-01", durableObjects: { HEALTH: { className: "RoutingHealthDurableObject", useSQLite: true } } });
try {
    const results = await Promise.all(Array.from({ length: 32 }, (_, n) =>
        runtime.dispatchFetch(`https://local.invalid/report?id=${n}`).then(response => response.json())));
    assert(results.every(result => result?.health && result?.generation));
    let state = await (await runtime.dispatchFetch("https://local.invalid/inspect")).json();
    assert.equal(state.rpc, 1); assert.equal(state.snapshot.providers.p.observations, 32);
    assert.equal(state.stats.active, 0);
    await (await runtime.dispatchFetch("https://local.invalid/report?id=sparse")).json();
    state = await (await runtime.dispatchFetch("https://local.invalid/inspect")).json();
    assert.equal(state.rpc, 2); assert.equal(state.snapshot.providers.p.observations, 33);
    assert.equal(state.stats.active, 0); assert.equal(state.stats.queued, 0);
    console.log(JSON.stringify({ result: "PASS", concurrentRequests: 32, batchRpcs: 1, sparseRequestRpcs: 1,
        crossRequestIoErrors: 0, pendingBatches: 0, kvBinding: false }));
} finally { await runtime.dispose(); }
