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
        import { reportCoordinatedHealth, coordinatedHealthMany } from './src/pipeline/execute/health-coordinator';
        import { healthPoolName } from './src/pipeline/execute/health-evidence';
        let kvCalls = 0;
        const forbiddenKv = new Proxy({}, { get() { kvCalls++; throw new Error('Unexpected KV use'); } });
        export class FaultHealth extends RoutingHealthDurableObject {
            calls = 0; available = false;
            setAvailable(value) { this.available = value; }
            testCounters() { return { calls: this.calls }; }
            async observeBatch(events) {
                this.calls++;
                if (!this.available) throw new Error('fixture unavailable');
                return super.observeBatch(events);
            }
        }
        export default { async fetch(request, env, execution) {
            configureRuntime({ ...env, GATEWAY_CACHE: forbiddenKv });
            const tasks = [];
            const release = setWaitUntil(task => { tasks.push(task); execution.waitUntil(task); });
            try {
                const input = await request.json();
                const model = input.model ?? 'outage';
                const stub = env.ROUTING_HEALTH.get(env.ROUTING_HEALTH.idFromName(healthPoolName('responses', model)));
                if (input.available !== undefined) await stub.setAvailable(input.available);
                for (let n = 0; n < (input.count ?? 1); n++) {
                    const now = Date.now();
                    reportCoordinatedHealth({ id: crypto.randomUUID(), endpoint: 'responses', model, provider: 'p',
                        observedAt: now, startedAt: now - 20, ok: false, limited: false, probe: false, latencyMs: 20, tps: null });
                }
                await healthBatcher.flushQueued();
                while (tasks.length) await Promise.all(tasks.splice(0));
                return Response.json({ ...(await stub.testCounters()), stats: healthBatcher.stats(), kvCalls,
                    local: coordinatedHealthMany('responses', model, ['p']).p,
                    snapshot: await stub.getSnapshot() });
            } finally { release(); clearRuntime(); }
        } };
    ` } });
const runtime = new Miniflare({ modules: [{ type: "ESModule", path: "health-outage.mjs", contents: bundle.outputFiles[0].text }],
    compatibilityDate: "2025-10-01", compatibilityFlags: ["nodejs_compat"],
    bindings: { SUPABASE_URL: "https://source.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture" },
    durableObjects: { ROUTING_HEALTH: { className: "FaultHealth", useSQLite: true } },
    outboundService: () => { throw new Error("Unexpected external call"); } });
const send = async body => {
    const response = await runtime.dispatchFetch("https://worker.invalid/", { method: "POST", body: JSON.stringify(body) });
    assert.equal(response.status, 200, response.status === 200 ? undefined : await response.text());
    return response.json();
};
try {
    const initial = await send({});
    assert.equal(initial.calls, 2);
    const storm = await send({ count: 1024 });
    assert.equal(storm.calls, 2, "Cooling-down reports must not make more RPCs");
    assert.ok(storm.local.err_ewma_60s > 0.99, "Local provider failures still affect routing");
    assert.equal(storm.local.observations, 1025);
    assert.equal(storm.stats.active, 0); assert.equal(storm.stats.queued, 0);
    const independent = await send({ model: "healthy", available: true });
    assert.equal(independent.calls, 1); assert.equal(independent.snapshot.providers.p.observations, 1);
    // Expiry is real Worker wall time, not a mocked coordinator or replacement isolate.
    await delay(5100);
    const recovered = await send({ available: true });
    assert.equal(recovered.calls, 3); assert.equal(recovered.snapshot.providers.p.observations, 1);
    const next = await send({});
    assert.equal(next.calls, 4); assert.equal(next.snapshot.providers.p.observations, 2);
    assert.equal(next.kvCalls, 0);
    assert.equal(next.stats.active, 0); assert.equal(next.stats.queued, 0);
    console.log(JSON.stringify({ result: "PASS", suppressedReports: 1024, outageReportRpcs: 2,
        independentPool: true, recoveryAfterCooldown: true, normalReportingResumes: true,
        externalCalls: 0, kvBinding: false, evidence: "Local native Workers, not billed-duration measurement" }));
} finally { await runtime.dispose(); }
