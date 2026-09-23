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
        import { readSseEvents, sseReadable } from './src/core/sse';
        const enc = new TextEncoder();
        export default { async fetch() {
            const input = enc.encode('event: delta\\r\\ndata: hello 🌍\\r\\ndata: second\\r\\n\\r\\n');
            let offset = 0;
            const source = new ReadableStream({ pull(controller) {
                if (offset === input.length) controller.close();
                else controller.enqueue(input.slice(offset, ++offset));
            } });
            const events = [];
            for await (const event of readSseEvents(source)) events.push(event);
            let pulls = 0, cancelled = 0;
            const pending = new ReadableStream({ pull() { pulls++; }, cancel() { cancelled++; } }, { highWaterMark: 0 });
            const transformed = sseReadable(async function* (signal) {
                for await (const event of readSseEvents(pending, { signal })) yield enc.encode(event.data);
            });
            await Promise.resolve(); const eagerPulls = pulls;
            const reader = transformed.getReader();
            const reading = reader.read();
            await new Promise(resolve => setTimeout(resolve, 1));
            await reader.cancel('test cancellation'); await reading;
            let oversized;
            try {
                for await (const event of readSseEvents(new Response('data: ' + 'x'.repeat(65) + '\\n\\n').body, { maxEventChars: 64 })) {}
            } catch (error) { oversized = error.code; }
            return Response.json({ events, eagerPulls, pulls, cancelled, released: !pending.locked && !source.locked, oversized });
        }};
    ` } });
const runtime = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: "2025-10-01" });
try {
    const result = await (await runtime.dispatchFetch("https://sse.example/test")).json();
    assert.deepEqual(result.events, [{ event: "delta", data: "hello 🌍\nsecond" }]);
    assert.equal(result.eagerPulls, 0); assert.equal(result.pulls, 1);
    assert.equal(result.cancelled, 1); assert.equal(result.released, true);
    assert.equal(result.oversized, "sse_frame_too_large");
    console.log(JSON.stringify({ result: "PASS", ...result }));
} finally { await runtime.dispose(); }
