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
const workspace = "10000000-0000-4000-8000-000000000001";
const claim = { workspace_id: workspace, revision: "20000000-0000-4000-8000-000000000001", lease_id: "30000000-0000-4000-8000-000000000001" };
const calls = [];
let failAck = true, busy = false;
const runtime = new Miniflare({ modules: [{ type: "ESModule", path: "publication-outbox.mjs", contents: bundle.outputFiles[0].text }],
    compatibilityDate: "2025-10-01", compatibilityFlags: ["nodejs_compat"],
    kvNamespaces: ["GATEWAY_CACHE"], bindings: {
        SUPABASE_URL: "https://source.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture-only",
        PHASEO_CONTROL_KEY: "fixture-control", PHASEO_CONTROL_SECRET: "fixture-secret",
        GATEWAY_WORKSPACE_PUBLICATION_ENABLED: "true",
    }, outboundService: async request => {
        const path = new URL(request.url).pathname;
        const body = await request.json();
        calls.push(path);
        if (path === "/rest/v1/rpc/gateway_claim_workspace_publications") {
            assert.equal(body.p_workspace_id, workspace); assert.equal(body.p_limit, 1);
            return Response.json(busy ? [] : [claim]);
        }
        if (path === "/rest/v1/rpc/gateway_finish_workspace_publication") {
            assert.equal(body.p_revision, claim.revision); assert.equal(body.p_lease_id, claim.lease_id);
            assert.equal(body.p_success, true);
            const kv = await runtime.getKVNamespace("GATEWAY_CACHE");
            assert.ok(Number(await kv.get(`gateway:workspace-policy-version:${workspace}`)) > 0);
            if (failAck) return Response.json({ message: "fixture ack unavailable" }, { status: 503 });
            return Response.json("completed");
        }
        throw new Error("Unexpected external operation");
    },
});
const url = `https://gateway.test/v1/workspaces/${workspace}/invalidate`;
const headers = { authorization: "Bearer fixture-control", "x-control-secret": "fixture-secret" };
try {
    const unauthorized = await runtime.dispatchFetch(url, { method: "POST" });
    assert.equal(unauthorized.status, 403); await unauthorized.text(); assert.equal(calls.length, 0);
    const failed = await runtime.dispatchFetch(url, { method: "POST", headers });
    assert.equal(failed.status, 503); assert.ok(!(await failed.text()).includes("fixture ack unavailable"));
    failAck = false;
    const retried = await runtime.dispatchFetch(url, { method: "POST", headers });
    assert.equal(retried.status, 200); assert.equal((await retried.json()).ok, true);
    assert.deepEqual(calls.map(path => path.split("/").at(-1)), [
        "gateway_claim_workspace_publications", "gateway_finish_workspace_publication",
        "gateway_claim_workspace_publications", "gateway_finish_workspace_publication",
    ]);
    const kv = await runtime.getKVNamespace("GATEWAY_CACHE");
    const previous = await kv.get(`gateway:workspace-policy-version:${workspace}`);
    busy = true;
    const leased = await runtime.dispatchFetch(url, { method: "POST", headers });
    assert.equal(leased.status, 503); await leased.text();
    assert.equal(await kv.get(`gateway:workspace-policy-version:${workspace}`), previous);
    console.log(JSON.stringify({ result: "PASS", mountedRoute: true, unauthorizedHasNoIO: true,
        failedAckSurfaced: true, retrySucceeded: true, busyLeaseDoesNotPublish: true, providerRequests: 0 }));
} finally { await runtime.dispose(); }
