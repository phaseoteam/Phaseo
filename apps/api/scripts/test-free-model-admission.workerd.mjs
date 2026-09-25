import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url), wrangler = createRequire(require.resolve("wrangler/package.json"));
const { build } = wrangler("esbuild"), { Miniflare } = wrangler("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({ absWorkingDir: root, bundle: true, format: "esm", platform: "browser", write: false,
    external: ["cloudflare:*", "node:*"], stdin: { resolveDir: root, loader: "ts", contents: `
        export { FreeModelQuotaDurableObject } from './src/core/free-model-quota-durable-object';
        import { guardFreeModelAdmission } from './src/pipeline/execute/free-model-admission';
        import { configureRuntime, clearRuntime } from './src/runtime/env';
        const card = { rules: [{ pricing_plan: 'free', price_per_unit: '0' }] };
        export default { async fetch(request, env) {
            configureRuntime(env);
            try {
                const url = new URL(request.url);
                const ctx = { workspaceId: url.searchParams.get('workspace'),
                    workspaceOwnerUserId: '10000000-0000-4000-8000-000000000001',
                    workspaceRuntimeExpiresAt: Date.now() + 60000 };
                const result = await guardFreeModelAdmission(ctx, card, 'gateway');
                if (result) return result;
                // Simulated provider fallback must not consume another quota slot.
                const fallback = await guardFreeModelAdmission(ctx, card, 'gateway');
                return fallback ?? Response.json({ allowed: true });
            } finally { clearRuntime(); }
        }};
    ` } });
const runtime = new Miniflare({ modules: [{ type: "ESModule", path: "free-admission.mjs", contents: bundle.outputFiles[0].text }], compatibilityDate: "2025-10-01",
    compatibilityFlags: ["nodejs_compat"], kvNamespaces: ["GATEWAY_CACHE"],
    bindings: { SUPABASE_URL: "https://source.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture", GATEWAY_FREE_MODEL_QUOTA_ENABLED: "true" },
    ratelimits: { FREE_MODEL_RATE_LIMITER: { simple: { limit: 100, period: 60 }, namespace_id: "1001" } },
    durableObjects: { FREE_MODEL_QUOTA: { className: "FreeModelQuotaDurableObject", useSQLite: true } },
    outboundService: () => { throw new Error("Unexpected external request"); } });
try {
    const statuses = await Promise.all(Array.from({ length: 32 }, async (_, i) => {
        const response = await runtime.dispatchFetch(`https://local.invalid/admit?workspace=${i % 2 ? 'workspace-a' : 'workspace-b'}`);
        await response.text(); return response.status;
    }));
    assert.equal(statuses.filter(status => status === 200).length, 25);
    assert.equal(statuses.filter(status => status === 429).length, 7);
    console.log(JSON.stringify({ result: "PASS", workspaces: 2, sharedOwner: true, requests: 32,
        accepted: 25, fallbacksConsumeAdditionalQuota: false, externalRequests: 0 }));
} finally { await runtime.dispose(); }
