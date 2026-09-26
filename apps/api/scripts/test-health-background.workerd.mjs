import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
const require = createRequire(import.meta.url), wrangler = createRequire(require.resolve("wrangler/package.json"));
const { build } = wrangler("esbuild"), { Miniflare } = wrangler("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({ absWorkingDir: root, bundle: true, format: "esm", platform: "browser", write: false,
    external: ["cloudflare:*", "node:*"], stdin: { resolveDir: root, loader: "ts", contents: `
        import { RoutingHealthDurableObject } from './src/core/routing-health-durable-object';
        import { configureRuntime, clearRuntime, setWaitUntil } from './src/runtime/env';
        import { healthBatcher } from './src/pipeline/execute/health-batcher';
        import { reportCoordinatedHealth } from './src/pipeline/execute/health-coordinator';
        import { healthPoolName } from './src/pipeline/execute/health-evidence';
        let kvCalls = 0, completed = 0;
        const forbiddenKv = new Proxy({}, { get() { kvCalls++; throw new Error('Unexpected KV use'); } });
        export class FaultHealth extends RoutingHealthDurableObject {
            calls = 0;
            testCounters() { return { calls: this.calls }; }
            async observeBatch(events) {
                this.calls++;
                const result = await super.observeBatch(events);
                if (events[0].model === 'lost' && this.calls === 1) throw new Error('fixture lost acknowledgement after commit');
                return result;
            }
        }
        export default { async fetch(request, env, execution) {
            const url = new URL(request.url), model = url.searchParams.get('model');
            if (url.pathname === '/inspect') {
                const stub = env.ROUTING_HEALTH.get(env.ROUTING_HEALTH.idFromName(healthPoolName('responses', model)));
                return Response.json({ ...(await stub.testCounters()), snapshot: await stub.getSnapshot(),
                    stats: healthBatcher.stats(), completed, kvCalls });
            }
            configureRuntime({ ...env, GATEWAY_CACHE: forbiddenKv });
            const tasks = [];
            const release = setWaitUntil(task => { tasks.push(task); execution.waitUntil(task); });
            const now = Date.now();
            try {
                reportCoordinatedHealth({ id: url.searchParams.get('id'), endpoint: 'responses', model, provider: 'p',
                    observedAt: now, startedAt: now - 20, ok: true, limited: false, probe: false, latencyMs: 20, tps: 10 });
                // As on the gateway, return without awaiting reporting and retain
                // runtime bindings until the request's background work settles.
                execution.waitUntil(Promise.all(tasks).finally(() => { completed++; clearRuntime(); }));
                return Response.json({ pending: healthBatcher.stats().active });
            } finally { release(); }
        } };
    ` } });
const runtime = new Miniflare({ modules: [{ type: "ESModule", path: "health-background.mjs", contents: bundle.outputFiles[0].text }],
    compatibilityDate: "2025-10-01", compatibilityFlags: ["nodejs_compat"],
    bindings: { SUPABASE_URL: "https://source.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture" },
    durableObjects: { ROUTING_HEALTH: { className: "FaultHealth", useSQLite: true } },
    outboundService: () => { throw new Error("Unexpected external call"); } });
async function inspect(model) {
    const response = await runtime.dispatchFetch(`https://worker.invalid/inspect?model=${model}`);
    assert.equal(response.status, 200);
    return response.json();
}
async function settled(model, expected) {
    for (let attempt = 0; attempt < 150; attempt++) {
        const state = await inspect(model);
        if (state.completed === expected && state.stats.active === 0) return state;
        await delay(20);
    }
    assert.fail(`Background reports failed to settle: ${JSON.stringify(await inspect(model))}`);
}
try {
    // Sparse traffic must return while its real one-second flush timer is pending.
    const sparse = await runtime.dispatchFetch('https://worker.invalid/report?model=sparse&id=sparse');
    assert.equal(sparse.status, 200);
    assert.equal((await sparse.json()).pending, 1);
    const initial = await settled('sparse', 1);
    assert.equal(initial.calls, 1);
    assert.equal(initial.snapshot.providers.p.observations, 1);
    for (const [wave, model] of ['healthy', 'lost'].entries()) {
        const responses = await Promise.all(Array.from({ length: 32 }, (_, n) =>
            runtime.dispatchFetch(`https://worker.invalid/report?model=${model}&id=${model}-${n}`)));
        for (const response of responses) {
            assert.equal(response.status, 200, response.status === 200 ? undefined : await response.text());
            // Discard the response body without awaiting health completion.
            await response.body.cancel();
        }
        const state = await settled(model, 1 + (wave + 1) * 32);
        assert.equal(state.calls, model === 'lost' ? 2 : 1);
        assert.equal(state.snapshot.providers.p.observations, 32, 'Ambiguous acknowledgement retry must not duplicate evidence');
        assert.equal(state.stats.queued, 0);
        assert.equal(state.stats.failed, 0);
        assert.equal(state.kvCalls, 0);
    }
    console.log(JSON.stringify({ result: 'PASS', backgroundRequests: 65, healthyBatchRpcs: 1,
        ambiguousBatchRpcs: 2, duplicateObservations: 0, kvCalls: 0, externalCalls: 0,
        evidence: 'Local response-body cancellation and waitUntil lifecycle, not deployed disconnect or billing evidence' }));
} finally { await runtime.dispose(); }
