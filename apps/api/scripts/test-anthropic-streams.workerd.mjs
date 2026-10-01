import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url), runtimeRequire = createRequire(require.resolve("wrangler/package.json"));
const { build } = runtimeRequire("esbuild"), { Miniflare } = runtimeRequire("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({ absWorkingDir: root, bundle: true, format: "esm", platform: "browser", write: false,
    stdin: { resolveDir: root, loader: "ts", contents: `
        import { observeAnthropicStream } from './src/executors/anthropic/text-generate/stream-usage';
        import { createAnthropicToResponsesStreamTransformer } from './src/executors/anthropic/text-generate/stream-transformer';
        const frame = value => 'data: ' + JSON.stringify(value) + '\\r\\n\\r\\n';
        const start = { type: 'message_start', message: { id: 'native', usage: { input_tokens: 120, cache_creation_input_tokens: 80 } } };
        const body = frame(start) + frame({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
            + frame({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello 🌍' } })
            + frame({ type: 'message_delta', delta: { stop_reason: 'max_tokens' }, usage: { output_tokens: 17 } }) + frame({ type: 'message_stop' });
        export default { async fetch() {
            let at = 0; const bytes = new TextEncoder().encode(body);
            const source = new ReadableStream({ pull(controller) {
                if (at < bytes.length) controller.enqueue(bytes.slice(at, ++at)); else controller.close();
            } });
            const observed = observeAnthropicStream(source);
            const converted = await new Response(observed.stream.pipeThrough(createAnthropicToResponsesStreamTransformer('request', 'claude'))).text();
            let pulls = 0, cancels = 0;
            const pending = new ReadableStream({ pull() { pulls++; }, cancel() { cancels++; } }, { highWaterMark: 0 });
            const observer = observeAnthropicStream(pending);
            await Promise.resolve(); const eagerPulls = pulls;
            const reader = observer.stream.getReader(), reading = reader.read();
            await new Promise(resolve => setTimeout(resolve, 1)); await reader.cancel(); await reading;
            let missingTerminal;
            try { await new Response(observeAnthropicStream(new Response(frame(start)).body).stream).text(); }
            catch (error) { missingTerminal = error.code; }
            return Response.json({ converted, usage: observed.finalUsage(), eagerPulls, pulls, cancels, missingTerminal,
                released: !source.locked && !pending.locked });
        }};
    ` } });
const runtime = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: "2025-10-01" });
try {
    const result = await (await runtime.dispatchFetch("https://anthropic.example/test")).json();
    assert.ok(result.converted.includes("Hello 🌍"));
    assert.ok(result.converted.includes("event: response.incomplete"));
    assert.ok(!result.converted.includes("event: response.completed"));
    assert.equal(result.usage.usage.cache_creation_input_tokens, 80);
    assert.equal(result.usage.usage.output_tokens, 17);
    assert.equal(result.usage.stopReason, "max_tokens");
    assert.equal(result.eagerPulls, 0); assert.equal(result.pulls, 1); assert.equal(result.cancels, 1);
    assert.equal(result.released, true); assert.equal(result.missingTerminal, "sse_missing_terminal");
    console.log(JSON.stringify({ result: "PASS", utf8CrLf: true, noAccountingTee: true, terminalUsage: true,
        incompleteTerminal: true, pullDriven: true, cancellationReleasesReader: true, truncationRejected: true }));
} finally { await runtime.dispose(); }
