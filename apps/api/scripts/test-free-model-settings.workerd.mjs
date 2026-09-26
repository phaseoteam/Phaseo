import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url), wrangler = createRequire(require.resolve("wrangler/package.json"));
const { build } = wrangler("esbuild"), { Miniflare } = wrangler("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const owner = "10000000-0000-4000-8000-000000000001", other = "20000000-0000-4000-8000-000000000002";
const bundle = await build({ absWorkingDir: root, bundle: true, format: "esm", platform: "browser", write: false,
    external: ["cloudflare:*", "node:*"], stdin: { resolveDir: root, loader: "ts", contents: `
        export { FreeModelQuotaDurableObject } from './src/core/free-model-quota-durable-object';
        import { internalFreeModelSettingsRoutes } from './src/routes/internal/free-model-settings';
        export default { async fetch(request, env, ctx) {
            if (new URL(request.url).pathname === '/fixture') {
                // Test-only seed; this route is never in the shipped Worker.
                await env.FREE_MODEL_QUOTA.getByName('owner:${owner}').setOverage(true, 0);
                return new Response(null, { status: 204 });
            }
            return internalFreeModelSettingsRoutes.fetch(request, env, ctx);
        }};
    ` } });
let authCalls = 0;
const runtime = new Miniflare({ modules: [{ type: "ESModule", path: "free-settings.mjs", contents: bundle.outputFiles[0].text }],
    compatibilityDate: "2025-10-01", compatibilityFlags: ["nodejs_compat"], kvNamespaces: ["GATEWAY_CACHE"],
    bindings: { SUPABASE_URL: "https://source.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture", GATEWAY_FREE_MODEL_QUOTA_ENABLED: "true" },
    ratelimits: { FREE_MODEL_RATE_LIMITER: { simple: { limit: 100, period: 60 }, namespace_id: "1001" } },
    durableObjects: { FREE_MODEL_QUOTA: { className: "FreeModelQuotaDurableObject", useSQLite: true } },
    outboundService: request => {
        assert.equal(request.url, "https://source.invalid/auth/v1/user");
        assert.equal(request.method, "GET");
        authCalls++;
        const token = request.headers.get("authorization");
        if (token !== "Bearer owner-session" && token !== "Bearer other-session") {
            return Response.json({ message: "invalid session" }, { status: 401 });
        }
        return Response.json({ id: token === "Bearer owner-session" ? owner : other, aud: "authenticated", role: "authenticated" });
    } });
async function call(token, body) {
    return runtime.dispatchFetch("https://local.invalid/", {
        method: body ? "PATCH" : "GET",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-owner-id": owner },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}
try {
    assert.equal((await runtime.dispatchFetch("https://local.invalid/fixture")).status, 204);
    const read = await call("owner-session");
    assert.equal(read.headers.get("cache-control"), "private, no-store");
    assert.equal((await read.json()).data.allowOverage, true);
    const foreign = await call("other-session");
    assert.equal((await foreign.json()).data.allowOverage, false);
    const disabled = await call("owner-session", { allowOverage: false, expectedVersion: 1 });
    assert.equal(disabled.status, 200);
    assert.equal((await disabled.json()).data.policyVersion, 2);
    const stale = await call("owner-session", { allowOverage: false, expectedVersion: 1 });
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).data.policyVersion, 2);
    const unavailable = await call("owner-session", { allowOverage: true, expectedVersion: 2 });
    assert.equal(unavailable.status, 409);
    assert.equal((await unavailable.json()).error, "free_model_overage_not_available");
    const invalid = await call("management-key");
    assert.equal(invalid.status, 401);
    await invalid.text();
    assert.equal(authCalls, 6);
    console.log(JSON.stringify({ result: "PASS", ownerIsolation: true, verifiedSessions: true,
        confirmedDisable: true, staleMutationRejected: true, overageEnableBlocked: true, outboundAuthCalls: authCalls }));
} finally { await runtime.dispose(); }
