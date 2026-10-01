import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const runtimeRequire = createRequire(require.resolve("wrangler/package.json"));
const { build } = runtimeRequire("esbuild"), { Miniflare } = runtimeRequire("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({ absWorkingDir: root, bundle: true, format: "esm", platform: "browser", write: false,
    stdin: { resolveDir: root, loader: "ts", contents: `
        import { creditAdmissionLeases as leases } from './src/core/credit-admission-leases';
        export default { async fetch(request, env) {
            const url = new URL(request.url), workspace = url.pathname.slice(1);
            if (request.method === 'DELETE') { leases.invalidate(workspace); return new Response('ok'); }
            if (workspace === 'stats') return Response.json(leases.stats());
            const result = await leases.read(workspace, async () => {
                const response = await env.ORIGIN.fetch('https://source.example/' + workspace);
                return await response.text();
            });
            return Response.json(result ? JSON.parse(result) : null);
        }};
    ` } });
let reads = 0;
const snapshots = new Map();
const runtime = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: "2025-10-01",
    serviceBindings: { ORIGIN: async request => {
        reads++;
        const workspaceId = new URL(request.url).pathname.slice(1);
        if (!snapshots.has(workspaceId)) snapshots.set(workspaceId, { workspaceId, credit: { ok: true, balanceNanos: 20e9 },
            cacheLease: { checkedAtMs: Date.now(), expiresAtMs: Date.now() + 120_000 } });
        await new Promise(resolve => setTimeout(resolve, 20));
        return Response.json(snapshots.get(workspaceId));
    } } });
const read = async workspace => (await runtime.dispatchFetch('https://credit.example/' + workspace)).json();
try {
    const burst = await Promise.all(Array.from({ length: 32 }, () => read('one')));
    assert.ok(burst.every(value => value.workspaceId === 'one' && value.credit.balanceNanos === 20e9));
    assert.equal(reads, 1);
    await read('one'); assert.equal(reads, 1);
    assert.equal((await read('two')).workspaceId, 'two'); assert.equal(reads, 2);
    await (await runtime.dispatchFetch('https://credit.example/one', { method: 'DELETE' })).text();
    assert.equal(await read('one'), null); assert.equal(reads, 3);
    assert.equal((await read('two')).workspaceId, 'two'); assert.equal(reads, 3);
    const stats = await read('stats'); assert.equal(stats.pending, 0);
    console.log(JSON.stringify({ result: 'PASS', concurrentRequests: 32, coldReads: 1, warmExternalOperations: 0,
        workspaceIsolation: true, invalidationRejectsStaleKv: true }));
} finally { await runtime.dispose(); }
