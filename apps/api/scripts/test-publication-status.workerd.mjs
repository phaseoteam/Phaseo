import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url), runtimeRequire = createRequire(require.resolve("wrangler/package.json"));
const { build } = runtimeRequire("esbuild"), { Miniflare } = runtimeRequire("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({ absWorkingDir: root, bundle: true, format: "esm", platform: "browser", write: false, external: ["node:*", "cloudflare:*"],
    stdin: { resolveDir: root, loader: "ts", contents: `
        import { Hono } from 'hono';
        import { internalCacheRoutes } from './src/routes/internal/cache';
        export default new Hono().route('/internal/cache', internalCacheRoutes);
    ` } });
const workspace = "10000000-0000-4000-8000-000000000001";
const token = "fixture-operator-token-".repeat(8);
const calls = [];
let data = { workspace_id: workspace, attempts: 10, created_at: "2020-01-01T00:00:00Z", available_at: "2020-01-01T00:00:00Z", lease_until: "2020-01-01T00:00:00Z" };
let fail = false;
const runtime = new Miniflare({ modules: [{ type: "ESModule", path: "publication-status.mjs", contents: bundle.outputFiles[0].text }],
    compatibilityDate: "2025-10-01", compatibilityFlags: ["nodejs_compat"], kvNamespaces: ["GATEWAY_CACHE"], bindings: {
        SUPABASE_URL: "https://source.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture-only",
        GATEWAY_INTERNAL_TEST_TOKEN: token, GATEWAY_WORKSPACE_PUBLICATION_ENABLED: "true",
    }, outboundService: async request => {
        const url = new URL(request.url);
        calls.push(url);
        assert.equal(request.method, "GET");
        assert.equal(url.hostname, "source.invalid");
        assert.equal(url.pathname, "/rest/v1/gateway_workspace_publications");
        assert.deepEqual([...url.searchParams.keys()].sort(), ["select", "workspace_id"]);
        assert.equal(url.searchParams.get("workspace_id"), `eq.${workspace}`);
        assert.equal(url.searchParams.get("select"), "workspace_id,attempts,created_at,available_at,lease_until");
        assert.equal(request.headers.get("x-internal-token"), null);
        if (fail) return Response.json({ message: "private source error" }, { status: 503 });
        return Response.json(data === null ? [] : [data]);
    },
});
const url = `https://gateway.test/internal/cache/workspace-publication/${workspace}`;
const headers = { "x-internal-token": token };
try {
    for (const provided of [{}, { authorization: `Bearer ${token}` }, { "x-internal-token": "wrong" }]) {
        const response = await runtime.dispatchFetch(url, { headers: provided });
        assert.equal(response.status, 401); await response.text();
    }
    const invalid = await runtime.dispatchFetch(url.replace(workspace, "invalid"), { headers });
    assert.equal(invalid.status, 400); await invalid.text();
    assert.equal(calls.length, 0);
    const exhausted = await runtime.dispatchFetch(url, { headers });
    assert.equal(exhausted.status, 200);
    assert.equal(exhausted.headers.get("cache-control"), "private, no-store");
    assert.equal((await exhausted.json()).data.state, "exhausted");
    data = { ...data, lease_until: new Date(Date.now() + 60_000).toISOString() };
    assert.equal((await (await runtime.dispatchFetch(url, { headers })).json()).data.state, "leased");
    data = null;
    assert.deepEqual(await (await runtime.dispatchFetch(url, { headers })).json(), { data: { state: "not_pending" } });
    fail = true;
    const failure = await runtime.dispatchFetch(url, { headers });
    assert.equal(failure.status, 503);
    assert.deepEqual(await failure.json(), { error: "workspace_publication_status_unavailable" });
    assert.equal(calls.length, 4);
    console.log(JSON.stringify({ result: "PASS", authorizedPointReads: 4, writes: 0, unauthorizedIO: 0,
        abandonedFinalLeaseVisible: true, activeFinalLeaseNotExhausted: true, missingIsNotFreshness: true }));
} finally { await runtime.dispose(); }
