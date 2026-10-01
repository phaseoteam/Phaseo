import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url), runtimeRequire = createRequire(require.resolve("wrangler/package.json"));
const { build } = runtimeRequire("esbuild"), { Miniflare } = runtimeRequire("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({ absWorkingDir: root, bundle: true, format: "esm", platform: "browser", write: false,
    external: ["node:*", "cloudflare:*"], stdin: { resolveDir: root, loader: "ts", contents: `
        import { transformStream } from './src/executors/google-ai-studio/text-generate';
        const args = { requestId: 'native-google', providerId: 'google-ai-studio', protocol: 'openai.chat.completions', ir: { model: 'gemini', messages: [] } };
        const frame = payload => 'data: ' + JSON.stringify(payload) + '\\r\\n\\r\\n';
        export default { async fetch() {
            const text = frame({ candidates: [{ index: 0, content: { parts: [{ text: 'Hello 🌍' }] }, finishReason: 'STOP' }] })
                + frame({ usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 } });
            const bytes = new TextEncoder().encode(text); let at = 0;
            const source = new ReadableStream({ pull(controller) {
                if (at < bytes.length) controller.enqueue(bytes.slice(at, ++at)); else controller.close();
            } });
            const output = await new Response(transformStream(source, args)).text();
            let truncated;
            try { await new Response(transformStream(new Response(frame({ candidates: [{ content: { parts: [{ text: 'partial' }] } }] })).body, args)).text(); }
            catch (error) { truncated = error.code; }
            let cancelled = 0, started;
            const readStarted = new Promise(resolve => { started = resolve; });
            const pendingSource = new ReadableStream({ pull() { started(); }, cancel() { cancelled++; } }, { highWaterMark: 0 });
            const reader = transformStream(pendingSource, args).getReader(); const pending = reader.read();
            await readStarted; await reader.cancel(); await pending;
            return Response.json({ unicode: output.includes('Hello 🌍'), finalUsage: output.includes('"total_tokens":15'),
                terminalCount: output.split('data: [DONE]').length - 1, truncated, released: !source.locked,
                cancelled, pendingReleased: !pendingSource.locked });
        }};
    ` } });
const runtime = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: "2025-10-01", compatibilityFlags: ["nodejs_compat"] });
try {
    const result = await (await runtime.dispatchFetch("https://google.example/test")).json();
    assert.deepEqual(result, { unicode: true, finalUsage: true, terminalCount: 1, truncated: "sse_missing_terminal", released: true, cancelled: 1, pendingReleased: true });
    console.log(JSON.stringify({ result: "PASS", ...result }));
} finally { await runtime.dispose(); }
