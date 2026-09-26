import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import type { HealthObservation } from "../../src/pipeline/execute/health-evidence";
const require = createRequire(import.meta.url), wrangler = createRequire(require.resolve("wrangler/package.json"));
const { Miniflare } = wrangler("miniflare"), { build } = wrangler("esbuild");
const here = dirname(fileURLToPath(import.meta.url));
const bundle = await build({ entryPoints: [resolve(here, "coordinator-local-worker.ts")], bundle: true, write: false,
    format: "esm", platform: "browser", external: ["cloudflare:workers"] });
let outbound = 0;
const options = { modules: true, script: bundle.outputFiles[0].text, compatibilityDate: "2025-10-01",
    // Deliberately no KV binding: successful health operation proves it isn't used.
    durableObjects: { ROUTING_HEALTH: { className: "LocalRoutingHealthDurableObject", useSQLite: true } },
    outboundService: () => { outbound++; throw new Error("No outbound fetches"); } };
const mf = new Miniflare(options);
const now = Date.now();
const event = (n: number): HealthObservation => ({ id: `event-${n}`, endpoint: "responses", model: "local-only", provider: "p", observedAt: now,
    startedAt: now - 500, ok: n % 4 !== 0, limited: false, latencyMs: 200, tps: 100, probe: false });
const call = async (operation: string, events = [event(0)], status = 200) => {
    const response = await mf.dispatchFetch("https://local.invalid", { method: "POST", body: JSON.stringify({ operation, events }) });
    assert.equal(response.status, status);
    return response.json();
};
try {
    await mf.ready;
    const events = Array.from({ length: 100 }, (_, n) => event(n));
    await call("observe", events);
    await call("batch", events.slice(0, 64)); // Ambiguous-response replay deduplicates in memory.
    const before = await call("inspect");
    assert.deepEqual(before.providers, []); assert.deepEqual(before.metadata, []); assert.equal(before.reports, 0);
    assert(before.alarm && before.alarm <= Date.now() + 31_000);
    const live = await call("snapshot");
    assert.equal(live.providers.p.observations, 100);
    assert.equal(live.providers.p.rec_tot_ew_60s, 100);
    assert.equal(live.providers.p.rec_ok_ew_60s, 75);
    assert.equal(live.providers.p.breaker, "closed");
    await call("batch", [event(100), { ...event(101), model: "wrong-pool" }], 400);
    await call("batch", [event(100), { ...event(101), latencyMs: -1 }], 400);
    await call("batch", Array.from({ length: 65 }, (_, n) => event(n + 100)), 400);
    assert.equal((await call("snapshot")).version, 100, "invalid batch is atomic");
    const stale = await call("observe", [{ ...event(102), observedAt: now - 180_000, startedAt: now - 181_000 }]);
    assert.equal(stale[0], null);
    const failed = await call("fail");
    assert.deepEqual(failed.providers, []); assert.deepEqual(failed.metadata, []);
    await call("observe", [event(99)]); // Retry re-arms a failed checkpoint without recounting.
    assert((await call("inspect")).alarm);
    await call("alarm");
    const checkpoint = await call("inspect");
    assert.equal(checkpoint.providers.length, 1); assert.equal(checkpoint.metadata[0].version, 100);
    assert.equal(checkpoint.alarm, null, "idle object must stop scheduling");
    await mf.setOptions(options);
    const restored = await call("snapshot");
    assert.equal(restored.providers.p.observations, 100);
    assert.notEqual(restored.generation, live.generation, "restart must fence non-durable revisions");
    // Dedupe intentionally isn't durable. A duplicate after restart can count twice.
    assert.equal((await call("observe", [event(50)]))[0].health.observations, 101);
    assert.equal((await call("inspect")).metadata[0].version, 100, "hot observation does not checkpoint");
    await mf.setOptions(options);
    assert.equal((await call("snapshot")).providers.p.observations, 100, "uncheckpointed advisory sample may be lost");
    await call("seed");
    await call("alarm"); assert.equal((await call("inspect")).reports, 2501);
    await call("alarm"); assert.equal((await call("inspect")).reports, 501);
    await call("alarm"); assert.equal((await call("inspect")).reports, 0);
    assert.equal((await call("inspect")).alarm, null);
    assert.equal(outbound, 0);
    const result = { result: "PASS", observations: 100, replayed: 64, rowsBeforeCheckpoint: 0,
        providerRowsAfterCheckpoint: 1, metadataRowsAfterCheckpoint: 1, kvBinding: false, outbound,
        checks: ["native concurrent aggregation", "bounded replay dedupe", "atomic invalid batches", "checkpoint rollback/retry",
            "checkpoint survives restart", "generation changes after restart", "explicit advisory loss", "finite bounded legacy cleanup", "idle alarms stop"] };
    const output = resolve(here, "results/coordinator-local"); mkdirSync(output, { recursive: true });
    writeFileSync(resolve(output, "verification.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
} finally { await mf.dispose(); }
