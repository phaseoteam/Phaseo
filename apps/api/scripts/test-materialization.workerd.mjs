import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url), runtimeRequire = createRequire(require.resolve("wrangler/package.json"));
const { build } = runtimeRequire("esbuild"), { Miniflare } = runtimeRequire("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({ absWorkingDir: root, bundle: true, format: "esm", platform: "browser", write: false,
    external: ["node:*", "cloudflare:*"],
    stdin: { resolveDir: root, loader: "ts", contents: `
        import { bufferStreamToIR } from './src/executors/_shared/text-generate/openai-compat';
        const args = { requestId: 'native-buffer', providerId: 'test', ir: { model: 'test', messages: [] } };
        export default { async fetch() {
            const bytes = new TextEncoder().encode('data: ' + JSON.stringify({ id: 'chat', object: 'chat.completion.chunk',
                choices: [{ index: 0, delta: { content: 'Hello 🌍' }, finish_reason: 'stop' }] }) + '\\r\\n\\r\\n'
                + 'data: ' + JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })
                + '\\r\\n\\r\\ndata: [DONE]\\r\\n\\r\\n');
            let at = 0;
            const source = new ReadableStream({ pull(controller) {
                if (at < bytes.length) controller.enqueue(bytes.slice(at, ++at)); else controller.close();
            } });
            const result = await bufferStreamToIR(new Response(source), args, 'chat', Date.now());
            let truncated;
            try { await bufferStreamToIR(new Response('data: ' + JSON.stringify({ choices: [{ index: 0, delta: { content: 'partial' }, finish_reason: 'stop' }] }) + '\\n\\n'), args, 'chat', Date.now()); }
            catch (error) { truncated = error.code; }
            const json = await bufferStreamToIR(Response.json({ id: 'chat-json', object: 'chat.completion', choices: [
                { index: 0, message: { role: 'assistant', content: 'JSON' }, finish_reason: 'stop' }
            ] }), args, 'chat', Date.now());
            return Response.json({ content: result.ir.choices[0].message.content, usage: result.usage,
                jsonContent: json.ir.choices[0].message.content, truncated, released: !source.locked });
        }};
    ` } });
const runtime = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: "2025-10-01", compatibilityFlags: ["nodejs_compat"] });
try {
    const result = await (await runtime.dispatchFetch("https://buffer.example/test")).json();
    assert.deepEqual(result.content, [{ type: "text", text: "Hello 🌍" }]);
    assert.equal(result.usage.total_tokens, 15);
    assert.deepEqual(result.jsonContent, [{ type: "text", text: "JSON" }]);
    assert.equal(result.truncated, "sse_missing_terminal"); assert.equal(result.released, true);
    console.log(JSON.stringify({ result: "PASS", unicodeCrLf: true, trailingUsage: true, jsonFallback: true, truncationRejected: true, releasedReader: true }));
} finally { await runtime.dispose(); }
