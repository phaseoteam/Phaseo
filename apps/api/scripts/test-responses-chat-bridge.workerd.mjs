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
        import { transformResponsesStreamToChat, transformChatStreamToResponses } from './src/executors/_shared/text-generate/openai-compat/stream-transforms';
        import { transformResponsesStreamToAnthropic } from './src/executors/_shared/text-generate/openai-compat/responses-to-messages-stream';
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
            const chatBridge = source => transformChatStreamToResponses(source, args, { requestId: args.requestId, providerId: args.providerId, choiceStates: new Map() });
            const chatFrame = 'data: ' + JSON.stringify({ object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: 'hello' }, finish_reason: 'stop' }] }) + '\\r\\n\\r\\n';
            const chatOutput = await new Response(chatBridge(new Response(chatFrame + 'data: [DONE]\\r\\n\\r\\n').body)).text();
            let chatIncomplete;
            try { await new Response(chatBridge(new Response(chatFrame).body)).text(); } catch (error) { chatIncomplete = error.code; }
            let chatPulls = 0, chatCancels = 0;
            const chatPending = new ReadableStream({ pull() { chatPulls++; }, cancel() { chatCancels++; } }, { highWaterMark: 0 });
            const chatReader = chatBridge(chatPending).getReader();
            await Promise.resolve(); const chatEager = chatPulls;
            const chatReading = chatReader.read(); await new Promise(resolve => setTimeout(resolve, 1));
            await chatReader.cancel(); await chatReading;
            const messagesBridge = source => transformResponsesStreamToAnthropic(source, args);
            const messagesOutput = await new Response(messagesBridge(new Response(bytes).body)).text();
            let messagesIncomplete;
            try { await new Response(messagesBridge(new Response(event('response.output_text.delta', { delta: 'partial' })).body)).text(); }
            catch (error) { messagesIncomplete = error.code; }
            let messagesPulls = 0, messagesCancels = 0;
            const messagesPending = new ReadableStream({ pull() { messagesPulls++; }, cancel() { messagesCancels++; } }, { highWaterMark: 0 });
            const messagesReader = messagesBridge(messagesPending).getReader();
            await Promise.resolve(); const messagesEager = messagesPulls;
            const messagesReading = messagesReader.read(); await new Promise(resolve => setTimeout(resolve, 1));
            await messagesReader.cancel(); await messagesReading;
            return Response.json({ output, eagerPulls, pulls, cancels, released: !source.locked && !pending.locked, incomplete,
                chatOutput, chatIncomplete, chatEager, chatPulls, chatCancels, chatReleased: !chatPending.locked,
                messagesOutput, messagesIncomplete, messagesEager, messagesPulls, messagesCancels, messagesReleased: !messagesPending.locked });
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
    assert.equal((result.chatOutput.match(/event: response.completed/g) ?? []).length, 1);
    assert.equal(result.chatIncomplete, "sse_missing_terminal");
    assert.equal(result.chatEager, 0); assert.equal(result.chatPulls, 1);
    assert.equal(result.chatCancels, 1); assert.equal(result.chatReleased, true);
    assert.equal((result.messagesOutput.match(/event: message_stop/g) ?? []).length, 1);
    assert.equal(result.messagesIncomplete, "sse_missing_terminal");
    assert.equal(result.messagesEager, 0); assert.equal(result.messagesPulls, 1);
    assert.equal(result.messagesCancels, 1); assert.equal(result.messagesReleased, true);
    console.log(JSON.stringify({ result: "PASS", ...result }));
} finally { await runtime.dispose(); }
