import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url), wrangler = createRequire(require.resolve("wrangler/package.json"));
const { build } = wrangler("esbuild"), { Miniflare } = wrangler("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({ absWorkingDir: root, bundle: true, format: "esm", platform: "browser", write: false,
    external: ["node:async_hooks"], plugins: [{ name: "local-background", setup(builder) {
        builder.onResolve({ filter: /^@\/runtime\/env$/ }, () => ({ path: "background", namespace: "fixture" }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ loader: "js",
            contents: "export function dispatchBackground(promise) { void promise.catch(() => undefined); }" }));
    } }], stdin: { resolveDir: root, loader: "ts", contents: `
        import { createPricedStreamSession } from './src/pipeline/after/streaming';
        export default { async fetch(request) {
            const truncated = new URL(request.url).pathname === '/truncated';
            const encode = frame => new TextEncoder().encode('data: ' + (frame === '[DONE]' ? frame : JSON.stringify(frame)) + '\\n\\n');
            let source, cancellations = 0, serialized = 0, rewrites = 0, observed = 0, disconnected = false;
            const first = { object: 'chat.completion.chunk', choices: [{ delta: { content: 'first' } }] };
            const upstream = new Response(new ReadableStream({ start(controller) { source = controller; controller.enqueue(encode(first)); }, cancel() { cancellations++; } }));
            let complete;
            const finalized = new Promise(resolve => { complete = resolve; });
            const ctx = { requestId: 'fixture', workspaceId: 'fixture', endpoint: 'chat.completions', protocol: 'openai.chat.completions', meta: {} };
            const { response, session } = await createPricedStreamSession({ upstream, ctx, provider: 'poolside', priceCard: null,
                onStreamEvent() { observed++; },
                rewriteFrame(frame) { rewrites++; return { toJSON() { serialized++; if (disconnected) throw new Error('dead_client_serialization'); return frame; } }; },
                onFinalUsage(usage, info) { complete({ usage, info }); },
            });
            const reader = response.body.getReader(); await reader.read(); await reader.cancel();
            disconnected = true;
            const cancelledOnDisconnect = cancellations;
            for (let i = 0; i < 2048; i++) source.enqueue(encode(first));
            source.enqueue(encode({ object: 'chat.completion.chunk', choices: [{ delta: {}, finish_reason: 'stop' }] }));
            source.enqueue(encode({ object: 'chat.completion.chunk', choices: [], usage: { prompt_tokens: 10, completion_tokens: 2049, total_tokens: 2059 } }));
            if (!truncated) source.enqueue(encode('[DONE]'));
            source.close();
            const outcome = await session.completion, receipt = await finalized;
            return Response.json({ serialized, rewrites, observed, outcome, receipt, cancelledOnDisconnect, released: !upstream.body.locked });
        }};
    ` } });
const runtime = new Miniflare({ modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: "2025-10-01", compatibilityFlags: ["nodejs_compat"],
    outboundService: () => { throw new Error("No external calls allowed"); } });
try {
    for (const mode of ["success", "truncated"]) {
        const result = await (await runtime.dispatchFetch(`https://fixture.invalid/${mode}`)).json();
        assert.equal(result.serialized, 1, "No JSON serialization after confirmed disconnect");
        assert.equal(result.rewrites, 2051, "Preserve all rewrite side effects");
        assert.ok(result.observed >= 2049, "Keep accounting/event observers active");
        assert.equal(result.cancelledOnDisconnect, 0);
        assert.equal(result.outcome.state, mode === "success" ? "CANCELLED" : "FAILED");
        assert.equal(result.outcome.deliveredFrames, 1);
        assert.equal(result.receipt.usage.total_tokens, 2059);
        assert.equal(result.receipt.info.sawFinalUsage, mode === "success");
        assert.equal(result.receipt.info.aborted, mode === "truncated");
        assert.equal(result.released, true);
    }
    console.log(JSON.stringify({ result: "PASS", tailFrames: 2050, serializedTailFrames: 0,
        rewriteCallbacksPreserved: true, finalUsagePreserved: true, truncatedUsageNotAuthoritative: true }));
} finally { await runtime.dispose(); }
