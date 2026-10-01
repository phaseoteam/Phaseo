import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url), wrangler = createRequire(require.resolve("wrangler/package.json"));
const { build } = wrangler("esbuild"), { Miniflare } = wrangler("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({ absWorkingDir: root, bundle: true, format: "esm", platform: "browser", write: false,
    stdin: { resolveDir: root, loader: "ts", contents: `
        import { prepareStreamAdmission } from './src/pipeline/execute/stream-admission';
        export default { async fetch() {
            const failure = { error: { type: 'api_error' }, usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 } };
            const wire = 'data: ' + JSON.stringify(failure) + '\\n\\n';
            const ready = await prepareStreamAdmission(new Response(wire).body);
            const replay = await new Response(ready.stream).text();
            let cancelled = 0;
            const pending = new ReadableStream({ cancel() { cancelled++; } }, { highWaterMark: 0 });
            const slow = await prepareStreamAdmission(pending);
            await slow.stream.cancel('client_left');
            return Response.json({ retry: ready.retryableZeroUsage, replay: replay === wire,
                slowRetry: slow.retryableZeroUsage, cancelled, locked: pending.locked });
        }};
    ` } });
const runtime = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: "2025-10-01" });
try {
    const result = await (await runtime.dispatchFetch("https://local.invalid/test")).json();
    assert.deepEqual(result, { retry: true, replay: true, slowRetry: false, cancelled: 1, locked: false });
    console.log(JSON.stringify({ result: "PASS", nativeStreamAdmission: result }));
} finally { await runtime.dispose(); }
