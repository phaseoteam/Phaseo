import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve("wrangler/package.json"));
const { build } = wranglerRequire("esbuild");
const { Miniflare } = wranglerRequire("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({ absWorkingDir: root, bundle: true, format: "esm", platform: "browser", write: false,
    plugins: [{ name: "background-test-runtime", setup(builder) {
        builder.onResolve({ filter: /^@\/runtime\/env$/ }, () => ({ path: "test-runtime", namespace: "test-runtime" }));
        builder.onLoad({ filter: /.*/, namespace: "test-runtime" }, () => ({ contents: "export function dispatchBackground(promise) { void promise.catch(() => undefined); }", loader: "js" }));
    } }],
    stdin: { resolveDir: root, loader: "ts", contents: `
        import { passthroughWithPricing } from './src/pipeline/after/streaming';
        export default { async fetch(request) {
            const mode = new URL(request.url).pathname;
            const terminal = 'data: {"object":"chat.completion.chunk","choices":[{"finish_reason":"stop"}],"usage":{"total_tokens":5}}\\r\\n\\r\\n';
            const source = new Response(terminal + (mode === '/success' ? 'data: [DONE]\\r\\n\\r\\n' : ''));
            const outcomes = [];
            const ctx = { requestId: mode, workspaceId: 'native-test', endpoint: 'chat.completions', protocol: 'openai.chat.completions', meta: {} };
            const response = await passthroughWithPricing({ upstream: source, ctx, provider: 'poolside', priceCard: null,
                rewriteFrame: mode === '/gateway' ? () => { throw new Error('mapping failed'); } : undefined,
                onFinalUsage: (usage, info) => { outcomes.push({ usage, info }); },
            });
            let text, error;
            try { text = await response.text(); } catch (failure) { error = failure.message; }
            await Promise.resolve();
            return Response.json({ outcomes, text, error, released: !source.body.locked });
        }};
    ` } });
const runtime = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: "2025-10-01" });
try {
    for (const mode of ["success", "truncated", "gateway"]) {
        const result = await (await runtime.dispatchFetch(`https://stream.example/${mode}`)).json();
        assert.equal(result.outcomes.length, 1); assert.equal(result.released, true);
        if (mode === "success") {
            assert.equal(result.error, undefined); assert.match(result.text, /\[DONE\]/);
            assert.deepEqual(result.outcomes[0], { usage: { total_tokens: 5 }, info: { aborted: false, sawFinalUsage: true } });
        } else {
            assert.ok(result.error);
            assert.deepEqual(result.outcomes[0].info, { aborted: true, sawFinalUsage: false,
                failureOrigin: mode === "gateway" ? "gateway" : "provider" });
        }
    }
    console.log(JSON.stringify({ result: "PASS", cases: ["terminal_usage", "truncated_after_usage", "gateway_transform_failure"], exactlyOnce: true, releasedReaders: true }));
} finally { await runtime.dispose(); }
