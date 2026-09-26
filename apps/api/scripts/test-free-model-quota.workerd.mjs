import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url), wrangler = createRequire(require.resolve("wrangler/package.json"));
const { build } = wrangler("esbuild"), { Miniflare } = wrangler("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({ absWorkingDir: root, bundle: true, format: "esm", platform: "browser", write: false,
    external: ["cloudflare:*", "node:*"], stdin: { resolveDir: root, loader: "ts", contents: `
        import { FreeModelQuotaDurableObject } from './src/core/free-model-quota-durable-object';
        export class QuotaProbe extends FreeModelQuotaDurableObject {
            async inspect() { return { rows: this.ctx.storage.sql.exec('SELECT * FROM free_quota').toArray(), alarm: await this.ctx.storage.getAlarm() }; }
            restart() { this.ctx.abort('fixture_restart'); }
        }
        export default { async fetch(request, env) {
            const url = new URL(request.url);
            const stub = env.QUOTA.getByName(url.searchParams.get('owner') ?? 'owner-a');
            switch(url.pathname) {
                case '/settings': return Response.json(await stub.getSettings());
                case '/set': return Response.json(await stub.setOverage(url.searchParams.get('enabled') === 'true', Number(url.searchParams.get('version'))));
                case '/inspect': { const state = await stub.inspect(); return Response.json({ rows: state.rows, alarm: await state.alarm }); }
                case '/restart': try { await stub.restart(); } catch {} return Response.json({ restarted: true });
                default: return Response.json(await stub.admit());
            }
        }};
    ` } });
const runtime = new Miniflare({ modules: [{ type: "ESModule", path: "quota.mjs", contents: bundle.outputFiles[0].text }], compatibilityDate: "2025-10-01",
    compatibilityFlags: ["nodejs_als"],
    durableObjects: { QUOTA: { className: "QuotaProbe", useSQLite: true } },
    outboundService: () => { throw new Error("Unexpected network call from quota"); } });
const request = async path => (await runtime.dispatchFetch(`https://local.invalid${path}`)).json();
try {
    const initial = await request('/settings');
    assert.equal(initial.allowOverage, false);
    const admissions = await Promise.all(Array.from({ length: 32 }, () => request('/admit')));
    assert.equal(admissions.filter(r => r.allowed).length, 25);
    const used = await request('/settings');
    assert.equal(used.requestsUsedToday, 25);
    const inspected = await request('/inspect');
    assert.equal(inspected.rows.length, 1);
    assert.equal(inspected.alarm, null);
    assert.equal((await request('/settings?owner=owner-b')).requestsUsedToday, 0);
    assert.equal((await request('/set?enabled=true&version=0')).updated, true);
    assert.equal((await request('/set?enabled=false&version=1')).updated, true);
    assert.equal((await request('/set?enabled=true&version=0')).updated, false);
    await request('/restart');
    const restored = await request('/settings');
    assert.equal(restored.requestsUsedToday, 25);
    assert.equal(restored.allowOverage, false);
    assert.equal(restored.policyVersion, 2);
    assert.equal((await request('/admit')).allowed, false);
    console.log(JSON.stringify({ result: "PASS", concurrentAdmissions: 32, accepted: 25, stateRows: 1,
        restartPreservesQuotaAndConsent: true, stalePolicyRejected: true, alarms: 0, externalCalls: 0 }));
} finally { await runtime.dispose(); }
