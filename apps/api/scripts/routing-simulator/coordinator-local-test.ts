import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import type { HealthObservation } from "../../src/pipeline/execute/health-evidence";
const require = createRequire(import.meta.url), wrangler = createRequire(require.resolve("wrangler/package.json"));
const { Miniflare } = wrangler("miniflare"), { build } = wrangler("esbuild");
const here = dirname(fileURLToPath(import.meta.url));
const bundle = await build({ entryPoints: [resolve(here, "coordinator-local-worker.ts")], bundle: true, write: false, format: "esm", platform: "browser", external: ["cloudflare:workers"] });
let outbound = 0;
const options = { modules: true, script: bundle.outputFiles[0].text, compatibilityDate: "2025-10-01",
    kvNamespaces: ["GATEWAY_CACHE"], durableObjects: { ROUTING_HEALTH: { className: "LocalRoutingHealthDurableObject", useSQLite: true } },
    outboundService: () => { outbound++; throw new Error("No outbound fetches"); } };
const mf = new Miniflare(options);
const now = Date.now();
const event = (n: number): HealthObservation => ({ id: `event-${n}`, endpoint: "responses", model: "local-only", provider: "p", observedAt: now,
    startedAt: now - 500, ok: n % 4 !== 0, limited: false, latencyMs: 200, tps: 100, probe: false });
const call = async (operation: string, events = [event(0)]) => {
    const response = await mf.dispatchFetch("https://local.invalid", { method: "POST", body: JSON.stringify({ operation, events }) });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
};
try {
    await mf.ready;
    const events = Array.from({ length: 100 }, (_, n) => event(n));
    await call("observe", events);
    await call("observe", events); // Replay the entire batch after ambiguous delivery.
    await call("alarm");
    const snapshot = await call("snapshot");
    assert.equal(snapshot.providers.p.observations, 100);
    assert.equal(snapshot.providers.p.rec_tot_ew_60s, 100);
    assert.equal(snapshot.providers.p.rec_ok_ew_60s, 75);
    assert.equal(snapshot.providers.p.breaker, "closed");
    // Updating the runtime evicts the JavaScript object while preserving storage.
    await mf.setOptions(options);
    const replay = await call("observe", [event(50)]);
    assert.equal(replay[0].health.observations, 100);
    const next = await call("observe", [{ ...event(101), ok: true }]);
    assert.equal(next[0].health.observations, 101);
    const stale = await call("observe", [{ ...event(102), observedAt: now - 180_000, startedAt: now - 181_000 }]);
    assert.equal(stale[0], null);
    const scheduled = (await call("inspect")).alarm;
    assert(scheduled && scheduled <= Date.now() + 61_000, "new traffic must advance an idle cleanup alarm");
    await call("force");
    const failed = await call("fail");
    assert.equal(failed.metadata[0].published, 100);
    assert.equal(failed.metadata[0].version, 101);
    assert(failed.alarm !== null);
    await call("alarm");
    assert.equal((await call("snapshot")).version, 101);
    await call("observe", [event(103)]);
    await call("force");
    const interleaved = await call("interleave", [event(104)]);
    assert.equal(interleaved.metadata[0].version, 103);
    assert.equal(interleaved.metadata[0].published, 102);
    assert.equal((await call("snapshot")).version, 102);
    await call("force"); await call("alarm");
    assert.equal((await call("snapshot")).version, 103);
    assert.equal(outbound, 0);
    const result = { observations: 103, replayed: 101, finalSnapshotVersion: 103, outbound,
        checks: ["concurrent additive counts", "duplicate replay", "persistent restart", "expired report rejection", "native KV publication", "publication rescheduling", "failed publication retained and retried", "reports arriving during publication remain dirty"] };
    const output = resolve(here, "results/coordinator-local"); mkdirSync(output, { recursive: true });
    writeFileSync(resolve(output, "verification.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
} finally { await mf.dispose(); }
