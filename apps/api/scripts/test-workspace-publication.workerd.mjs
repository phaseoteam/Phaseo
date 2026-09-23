import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url), runtimeRequire = createRequire(require.resolve("wrangler/package.json"));
const { build } = runtimeRequire("esbuild"), { Miniflare } = runtimeRequire("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({ absWorkingDir: root, bundle: true, format: "esm", platform: "browser", write: false, external: ["node:*", "cloudflare:*"],
    stdin: { resolveDir: root, loader: "ts", contents: `
        import { Hono } from 'hono';
        import { platformRouter } from './src/routes/v1/control';
        export default new Hono().route('/v1', platformRouter);
    ` } });
let externalRequests = 0;
const runtime = new Miniflare({ modules: [{ type: "ESModule", path: "publication.mjs", contents: bundle.outputFiles[0].text }],
    compatibilityDate: "2025-10-01", compatibilityFlags: ["nodejs_compat"],
    kvNamespaces: ["GATEWAY_CACHE"], bindings: {
        SUPABASE_URL: "https://source.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture-only",
        PHASEO_CONTROL_KEY: "fixture-control", PHASEO_CONTROL_SECRET: "fixture-secret",
    }, outboundService: () => { externalRequests++; throw new Error("Publication must not contact database or provider"); },
});
try {
    const kv = await runtime.getKVNamespace("GATEWAY_CACHE");
    await kv.put("gateway:private-routes:v1:workspace-a", "stale-fixture");
    const url = "https://gateway.test/v1/workspaces/workspace-a/invalidate";
    const bad = await runtime.dispatchFetch(url, { method: "POST" });
    assert.equal(bad.status, 403); await bad.text();
    assert.equal((await kv.list()).keys.length, 1);
    const response = await runtime.dispatchFetch(url, { method: "POST", headers: {
        authorization: "Bearer fixture-control", "x-control-secret": "fixture-secret",
    } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true); assert.equal(body.context_version, 1); assert.equal(body.cache_version, 1);
    const keys = (await kv.list()).keys;
    assert.equal(keys.length, 1); assert.equal(await kv.get(keys[0].name), "1");
    assert.equal(await kv.get("gateway:private-routes:v1:workspace-a"), null);
    assert.equal(externalRequests, 0);
    console.log(JSON.stringify({ result: "PASS", mountedRoute: true, unauthorizedRejected: true, contextAndPolicyPublished: true, privateCacheDeleted: true, databaseAndProviderRequests: externalRequests }));
} finally { await runtime.dispose(); }
