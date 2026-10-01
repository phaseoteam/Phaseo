import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve("wrangler/package.json"));
const { build } = wranglerRequire("esbuild");
const { Miniflare } = wranglerRequire("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({ absWorkingDir: root, bundle: true, format: "esm", platform: "browser", write: false,
    stdin: { resolveDir: root, loader: "ts", contents: `
        import { transformResponsesStreamToChat } from './src/executors/_shared/text-generate/openai-compat/stream-transforms';
        const args = { providerId: 'poolside', requestId: 'native-bridge', ir: { model: 'test', messages: [] } };
        const bridge = source => transformResponsesStreamToChat(source, args, { requestId: args.requestId, providerId: args.providerId, choiceStates: new Map() });
        const enc = new TextEncoder();
        const event = (type, fields) => 'data: ' + JSON.stringify({ type, ...fields }) + '\\r\\n\\r\\n';
        export default { async fetch() {
            const bytes = enc.encode(event('response.output_text.delta', { delta: 'Hello 🌍' }) + event('response.completed', { response: {
                object: 'response', id: 'native', status: 'completed', model: 'test', output: [], usage: { total_tokens: 3 }
            } }));
            let offset = 0;
            const source = new ReadableStream({ pull(controller) {
                if (offset === bytes.length) controller.close(); else controller.enqueue(bytes.slice(offset, ++offset));
            } });
            const output = await new Response(bridge(source)).text();
            let pulls = 0, cancels = 0;
            const pending = new ReadableStream({ pull() { pulls++; }, cancel() { cancels++; } }, { highWaterMark: 0 });
            const reader = bridge(pending).getReader();
            await Promise.resolve(); const eagerPulls = pulls;
            const reading = reader.read(); await new Promise(resolve => setTimeout(resolve, 1));
            await reader.cancel(); await reading;
            let incomplete;
            try { await new Response(bridge(new Response(event('response.output_text.delta', { delta: 'partial' })).body)).text(); }
            catch (error) { incomplete = error.code; }
            return Response.json({ output, eagerPulls, pulls, cancels, released: !source.locked && !pending.locked, incomplete });
        }};
    ` } });
const runtime = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: "2025-10-01" });
try {
    const result = await (await runtime.dispatchFetch("https://bridge.example/test")).json();
    assert.equal((result.output.match(/\[DONE\]/g) ?? []).length, 1);
    assert.ok(result.output.includes("Hello 🌍"));
    assert.equal(result.eagerPulls, 0); assert.equal(result.pulls, 1);
    assert.equal(result.cancels, 1); assert.equal(result.released, true);
    assert.equal(result.incomplete, "sse_missing_terminal");
    console.log(JSON.stringify({ result: "PASS", ...result }));
} finally { await runtime.dispose(); }
