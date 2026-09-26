import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url), wrangler = createRequire(require.resolve("wrangler/package.json"));
const { build } = wrangler("esbuild"), { Miniflare } = wrangler("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({ absWorkingDir: root, bundle: true, format: "esm", platform: "browser", write: false,
    external: ["cloudflare:*", "node:*"], stdin: { resolveDir: root, loader: "ts", contents: `
        import { FreeModelQuotaDurableObject } from './src/core/free-model-quota-durable-object';
        import { initialFreeQuota, FREE_MODEL_DAILY_ALLOWANCE } from './src/core/free-model-quota';
        export class CostProbe extends FreeModelQuotaDurableObject {
            // All inspection/seeding methods are test-only; never shipped.
            async inspect() {
                const rows = this.ctx.storage.sql.exec('SELECT state FROM free_quota').toArray();
                return { rows, changes: this.ctx.storage.sql.exec('SELECT total_changes() AS n').one().n,
                    bytes: this.ctx.storage.sql.databaseSize, alarm: await this.ctx.storage.getAlarm() };
            }
            seed(mode) {
                const next = { ...initialFreeQuota(Date.now()), used: FREE_MODEL_DAILY_ALLOWANCE };
                const state = mode === 'corrupt' ? '{}' : JSON.stringify(next);
                this.ctx.storage.sql.exec('INSERT INTO free_quota (id, state) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET state = excluded.state', state);
            }
            restart() { this.ctx.abort('fixture_restart'); }
        }
        export default { async fetch(request, env) {
            const url = new URL(request.url), owner = url.searchParams.get('owner') ?? 'denied';
            const stub = env.QUOTA.getByName(owner);
            try {
                switch(url.pathname) {
                    case '/seed': await stub.seed(url.searchParams.get('mode')); return Response.json({ seeded: true });
                    case '/restart': try { await stub.restart(); } catch {} return Response.json({ restarted: true });
                    case '/inspect': return Response.json(await stub.inspect());
                    case '/settings': return Response.json(await stub.getSettings());
                    case '/consent': return Response.json(await stub.setOverage(false, 0));
                    default: return Response.json(await stub.admit());
                }
            } catch { return Response.json({ error: 'quota_unavailable' }, { status: 503 }); }
        }};
    ` } });
const runtime = new Miniflare({ modules: [{ type: "ESModule", path: "quota-cost.mjs", contents: bundle.outputFiles[0].text }], compatibilityDate: "2025-10-01",
    compatibilityFlags: ["nodejs_als"],
    durableObjects: { QUOTA: { className: "CostProbe", useSQLite: true } },
    outboundService: () => { throw new Error("Quota must not call external services"); } });
async function call(path) {
    const response = await runtime.dispatchFetch(`https://fixture.invalid${path}`);
    return { status: response.status, data: await response.json() };
}
async function waves(count, fn) {
    // Bound load on the local harness; these are real Worker -> DO RPCs.
    const results = [];
    for (let i = 0; i < count; i += 32) results.push(...await Promise.all(Array.from({ length: Math.min(32, count - i) }, (_, j) => fn(i + j))));
    return results;
}
try {
    await call('/seed');
    await call('/restart');
    const before = (await call('/inspect')).data;
    const denials = await waves(1024, () => call('/admit'));
    assert.ok(denials.every(result => result.status === 200 && !result.data.allowed && result.data.reason === 'daily_limit'));
    await waves(128, () => call('/settings'));
    await waves(128, () => call('/consent'));
    const after = (await call('/inspect')).data;
    assert.equal(after.changes, before.changes, "Denials, reads and unchanged consent must not write rows");
    assert.deepEqual(after.rows, before.rows);
    assert.equal(after.bytes, before.bytes, "No per-request rows or persisted request history");
    assert.equal(after.alarm, null, "No recurring quota alarm");
    await call('/restart');
    assert.equal((await call('/admit')).data.reason, 'daily_limit', "Eviction cannot restore spent allowance");
    const owners = await waves(64, async n => {
        const first = await call('/admit?owner=isolated-' + n);
        const second = await call('/admit?owner=isolated-' + n);
        const state = (await call('/inspect?owner=isolated-' + n)).data;
        assert.equal(first.data.allowed, true); assert.equal(second.data.allowed, true);
        assert.equal(state.rows.length, 1); assert.equal(state.changes, 2);
        assert.equal(JSON.parse(state.rows[0].state).used, 2);
        assert.equal(state.alarm, null);
        return state.bytes;
    });
    await call('/seed?owner=broken&mode=corrupt');
    await call('/restart?owner=broken');
    const broken = await call('/admit?owner=broken');
    assert.equal(broken.status, 503, "Malformed durable state must not mint new allowance");
    assert.equal((await call('/admit?owner=healthy')).data.allowed, true, "Broken owner must not poison other owners");
    console.log(JSON.stringify({ result: 'PASS', deniedRpcs: 1024, settingsRpcs: 128, unchangedConsentRpcs: 128,
        denialReadConsentRowMutations: after.changes - before.changes, isolatedOwners: owners.length,
        acceptedRowMutationsPerOwner: 2, stateRowsPerOwner: 1, restartPreservesExhaustion: true,
        corruptOwnerFailsClosed: true, externalCalls: 0, alarms: 0,
        note: 'Local operation evidence, not production billed duration or throughput' }));
} finally { await runtime.dispose(); }
