import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve("wrangler/package.json"));
const { build } = wranglerRequire("esbuild");
const { Miniflare } = wranglerRequire("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({
    absWorkingDir: root, bundle: true, format: "esm", platform: "neutral", write: false,
    external: ["node:async_hooks"],
    stdin: { resolveDir: root, loader: "ts", contents: `
        import { RequestOperations, withRequestOperations, instrumentKv, markProviderDispatch, countOperation, measureDispatchStage }
            from './src/runtime/request-operations';
        export default { async fetch(request, env, ctx) {
            const record = new RequestOperations();
            return withRequestOperations(record, async () => {
                const kv = instrumentKv(env.CACHE);
                const count = Number(new URL(request.url).pathname.slice(1));
                for (let n = 0; n < count; n++) await measureDispatchStage('credit.cache', () => kv.get('gateway:credit:private'));
                markProviderDispatch();
                const background = Promise.resolve().then(() => { countOperation('healthRpc'); });
                record.track(background); ctx.waitUntil(background);
                await record.drain();
                return Response.json(record.snapshot());
            });
        }};
    ` },
});
const runtime = new Miniflare({ modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: "2025-10-01", compatibilityFlags: ["nodejs_als"], kvNamespaces: ["CACHE"] });
try {
    const results = await Promise.all(Array.from({ length: 12 }, (_, index) =>
        runtime.dispatchFetch(`https://test.example/${index + 1}`).then(response => response.json())));
    results.forEach((result, index) => {
        assert.deepEqual(result.total, { kvRead: index + 1, healthRpc: 1 });
        assert.deepEqual(result.beforeDispatch, { kvRead: index + 1 });
        assert.equal(result.complete, true);
        assert.equal(result.dispatchTimings.length, index + 1);
        assert.equal(result.dispatchTimingsOverflow, false);
        for (const timing of result.dispatchTimings) {
            assert.equal(timing.stage, 'credit.cache');
            assert.equal(timing.state, 'fulfilled');
            assert.ok(timing.startMs >= 0 && timing.endMs >= timing.startMs && timing.endMs <= result.beforeDispatchMs);
        }
        assert.deepEqual(result.kvByPurpose, { credit: { kvRead: index + 1 } });
        assert.match(result.runtimeInstanceId, /^[0-9a-f-]{36}$/);
        assert.equal(result.runtimeInstanceId, results[0].runtimeInstanceId);
        assert.ok(!JSON.stringify(result).includes('private'));
    });
    const replacement = new Miniflare({ modules: true, script: bundle.outputFiles[0].text,
        compatibilityDate: "2025-10-01", compatibilityFlags: ["nodejs_als"], kvNamespaces: ["CACHE"] });
    try {
        const fresh = await replacement.dispatchFetch('https://test.example/1').then(response => response.json());
        assert.notEqual(fresh.runtimeInstanceId, results[0].runtimeInstanceId);
        assert.deepEqual(fresh.total, { kvRead: 1, healthRpc: 1 });
    } finally { await replacement.dispose(); }
    console.log("PASS: 12 interleaved native Workers requests, real KV binding, isolated counts and background context");
} finally { await runtime.dispose(); }
