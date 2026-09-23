import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve("wrangler/package.json"));
const { build } = wranglerRequire("esbuild");
const { Miniflare } = wranglerRequire("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({ absWorkingDir: root, bundle: true, format: "esm", platform: "browser", write: false,
    external: ["node:async_hooks"],
    plugins: [{ name: "background-test-runtime", setup(builder) {
        builder.onResolve({ filter: /^@\/runtime\/env$/ }, () => ({ path: "test-runtime", namespace: "test-runtime" }));
        builder.onLoad({ filter: /.*/, namespace: "test-runtime" }, () => ({ contents: "export function dispatchBackground(promise) { void promise.catch(() => undefined); }", loader: "js" }));
    } }],
    stdin: { resolveDir: root, loader: "ts", contents: `
        import { createPricedStreamSession } from './src/pipeline/after/streaming';
        import { RequestOperations, withRequestOperations } from './src/runtime/request-operations';
        export default { async fetch(request) {
            const metrics = new RequestOperations();
            return withRequestOperations(metrics, async () => {
            const mode = new URL(request.url).pathname;
            const terminal = 'data: {"object":"chat.completion.chunk","choices":[{"finish_reason":"stop"}],"usage":{"total_tokens":5}}\\r\\n\\r\\n';
            const source = new Response(terminal + (['/success', '/cancel'].includes(mode) ? 'data: [DONE]\\r\\n\\r\\n' : ''));
            const outcomes = [];
            const ctx = { requestId: mode, workspaceId: 'native-test', endpoint: 'chat.completions', protocol: 'openai.chat.completions', meta: {} };
            const { response, session } = await createPricedStreamSession({ upstream: source, ctx, provider: 'poolside', priceCard: null,
                rewriteFrame: mode === '/gateway' ? () => { throw new Error('mapping failed'); } : undefined,
                onFinalUsage: (usage, info) => { outcomes.push({ usage, info }); },
            });
            const initialState = session.state;
            let text, error;
            try {
                if (mode === '/cancel') { const reader = response.body.getReader(); await reader.read(); await reader.cancel(); }
                else text = await response.text();
            } catch (failure) { error = failure.message; }
            const outcome = await session.completion;
            await Promise.resolve();
            return Response.json({ outcomes, outcome, metrics: metrics.snapshot(), initialState, text, error, released: !source.body.locked });
            });
        }};
    ` } });
const runtime = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: "2025-10-01", compatibilityFlags: ["nodejs_compat"] });
try {
    for (const mode of ["success", "truncated", "gateway", "cancel"]) {
        const result = await (await runtime.dispatchFetch(`https://stream.example/${mode}`)).json();
        assert.equal(result.outcomes.length, 1); assert.equal(result.released, true);
        assert.equal(result.initialState, "PRE_COMMIT");
        assert.equal(result.outcome.state, mode === "success" ? "COMPLETED" : mode === "cancel" ? "CANCELLED" : "FAILED");
        assert.equal(result.outcome.committed, mode !== "gateway");
        assert.equal(result.metrics.stream.state, result.outcome.state);
        assert.equal(result.metrics.stream.committed, result.outcome.committed);
        assert.equal(result.metrics.stream.finishReason, "stop");
        assert.equal(result.metrics.stream.firstOutputObservedMs, null);
        assert.ok(result.metrics.stream.durationMs >= 0);
        assert.deepEqual(result.metrics.total, {});
        assert.ok(!JSON.stringify(result.metrics).includes("total_tokens"));
        if (mode === "success") {
            assert.equal(result.error, undefined); assert.match(result.text, /\[DONE\]/);
            assert.deepEqual(result.outcomes[0], { usage: { total_tokens: 5 }, info: { aborted: false, sawFinalUsage: true } });
        } else if (mode === "cancel") {
            assert.equal(result.outcome.downstreamDisconnected, true);
            assert.deepEqual(result.outcome.usage, { total_tokens: 5 });
            assert.deepEqual(result.outcome.finalInfo, { aborted: false, sawFinalUsage: true });
        } else {
            if (mode === "gateway") assert.ok(result.error);
            else { assert.equal(result.error, undefined); assert.match(result.text, /sse_missing_terminal/); assert.doesNotMatch(result.text, /\[DONE\]/); }
            assert.deepEqual(result.outcomes[0].info, { aborted: true, sawFinalUsage: false,
                failureOrigin: mode === "gateway" ? "gateway" : "provider" });
        }
    }
    console.log(JSON.stringify({ result: "PASS", cases: ["terminal_usage", "truncated_after_usage", "gateway_transform_failure", "cancel_with_usage"], exactlyOnce: true, releasedReaders: true, deliveryCommitment: true }));
} finally { await runtime.dispose(); }
