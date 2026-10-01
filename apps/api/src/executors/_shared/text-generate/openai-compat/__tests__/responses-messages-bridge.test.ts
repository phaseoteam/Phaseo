import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
import { transformResponsesStreamToAnthropic } from "../responses-to-messages-stream";

const args = { providerId: "poolside", requestId: "messages-bridge", ir: { model: "test", messages: [] } } as unknown as ExecutorExecuteArgs;
const frame = (type: string, fields: object = {}) => `data: ${JSON.stringify({ type, ...fields })}\r\n\r\n`;
const terminal = (status = "completed", output: unknown[] = []) => frame(`response.${status}`, { response: { object: "response", id: "native", model: "test", status, output, usage: { input_tokens: 2, output_tokens: 1 } } });
const textDelta = (text: string) => frame("response.output_text.delta", { item_id: "text", output_index: 0, delta: text });
const item = (index: number) => frame("response.output_item.added", { output_index: index, item: { id: `item${index}`, call_id: `call${index}`, type: "function_call", name: "lookup", arguments: "" } });
const toolDelta = (index: number, delta: string) => frame("response.function_call_arguments.delta", { item_id: `item${index}`, output_index: index, delta });
const itemDone = (index: number) => frame("response.output_item.done", { item: { id: `item${index}`, call_id: `call${index}` }, output_index: index });
const bridge = (source: ReadableStream<Uint8Array>) => transformResponsesStreamToAnthropic(source, args);
const convert = (wire: string) => new Response(bridge(new Response(wire).body!)).text();
const frames = (text: string) => text.trim().split("\n\n").map(event => JSON.parse(event.split("\n").find(line => line.startsWith("data:"))!.slice(6)));

describe("bounded Responses-to-Messages bridge", () => {
    it("preserves split UTF-8/CRLF and payload event types with one message_stop", async () => {
        const bytes = new TextEncoder().encode(textDelta("Hello 🌍") + terminal() + textDelta("late"));
        let offset = 0;
        const source = new ReadableStream<Uint8Array>({ pull(controller) {
            if (offset === bytes.length) controller.close(); else controller.enqueue(bytes.slice(offset, ++offset));
        } });
        const output = frames(await new Response(bridge(source)).text());
        expect(output.filter(event => event.type === "message_stop")).toHaveLength(1);
        expect(output.find(event => event.delta?.text).delta.text).toBe("Hello 🌍");
        expect(JSON.stringify(output)).not.toContain("late"); expect(source.locked).toBe(false);
    });

    it.each([
        ["truncated EOF", textDelta("partial"), "sse_missing_terminal"],
        ["bare DONE", "data: [DONE]\n\n", "sse_missing_terminal"],
        ["malformed JSON", "data: broken\n\n", "sse_invalid_json"],
        ["too many blocks", Array.from({ length: 129 }, (_, i) => item(i)).join(""), "sse_state_too_large"],
        ["oversized identity", frame("response.output_text.delta", { item_id: "x".repeat(1025), delta: "x" }), "sse_state_too_large"],
        ["delta after item done", item(0) + itemDone(0) + toolDelta(0, "late"), "sse_invalid_tool_delta"],
    ])("rejects %s without manufacturing success", async (_label, wire, code) => {
        await expect(convert(wire)).rejects.toMatchObject({ code });
    });

    it("propagates read failures and releases ownership", async () => {
        const source = new ReadableStream<Uint8Array>({ pull(controller) { controller.error(new Error("read failed")); } });
        await expect(new Response(bridge(source)).text()).rejects.toThrow("read failed");
        expect(source.locked).toBe(false);
    });

    it("does not eagerly read and cancels a blocked upstream", async () => {
        let pulls = 0, cancels = 0;
        const source = new ReadableStream<Uint8Array>({ pull() { pulls++; }, cancel() { cancels++; } }, { highWaterMark: 0 });
        const reader = bridge(source).getReader();
        await Promise.resolve(); expect(pulls).toBe(0);
        const pending = reader.read(); await new Promise(resolve => setTimeout(resolve, 0));
        await reader.cancel(); await pending;
        expect(pulls).toBe(1); expect(cancels).toBe(1); expect(source.locked).toBe(false);
    });

    it("honours backpressure within a multi-frame translation", async () => {
        let pulls = 0;
        const source = new ReadableStream<Uint8Array>({ pull(controller) {
            pulls++; controller.enqueue(new TextEncoder().encode(textDelta("hello")));
        } }, { highWaterMark: 0 });
        const reader = bridge(source).getReader();
        await reader.read(); await reader.read(); await reader.read();
        await new Promise(resolve => setTimeout(resolve, 0)); expect(pulls).toBe(1);
        await reader.cancel(); expect(source.locked).toBe(false);
    });

    it("serializes interleaved tools correctly for the real Anthropic SDK", async () => {
        const wire = item(0) + item(1) + toolDelta(1, '{"b":') + toolDelta(0, '{"a":1}')
            + itemDone(0) + toolDelta(1, "2}") + itemDone(1) + terminal();
        const client = new Anthropic({ apiKey: "test-only", fetch: async () => new Response(bridge(new Response(wire).body!), { headers: { "content-type": "text/event-stream" } }) });
        const stream = client.messages.stream({ model: "test", messages: [], max_tokens: 16 });
        const blocks: unknown[] = [];
        stream.on("contentBlock", block => blocks.push(block));
        const message = await stream.finalMessage();
        expect(message.content).toMatchObject([
            { type: "tool_use", id: "call0", name: "lookup", input: { a: 1 } },
            { type: "tool_use", id: "call1", name: "lookup", input: { b: 2 } },
        ]);
        expect(blocks).toEqual(message.content);
        expect(message.stop_reason).toBe("tool_use");
    });

    it("preserves done-only tool contents before closing their block", async () => {
        const output = frames(await convert(item(0) + frame("response.output_item.done", { output_index: 0,
            item: { id: "item0", call_id: "call0", type: "function_call", name: "lookup", arguments: '{"x":1}' },
        }) + terminal()));
        expect(output.find(event => event.delta?.partial_json).delta.partial_json).toBe('{"x":1}');
        expect(output.findIndex(event => event.delta?.partial_json)).toBeLessThan(output.findIndex(event => event.type === "content_block_stop"));
    });

    it("preserves rate-limit classification without a successful stop", async () => {
        const output = frames(await convert(frame("response.failed", { response: { error: { code: "rate_limit_exceeded", message: "Limited", status: 429 } } }) + terminal()));
        expect(output).toEqual([{ type: "error", error: { type: "rate_limit_error", code: "rate_limit_exceeded", message: "Limited", status: 429 } }]);
    });

    it("bounds interleaved block buffering while the first block remains open", async () => {
        const wire = item(0) + item(1) + Array.from({ length: 4097 }, () => toolDelta(1, "x")).join("");
        await expect(convert(wire)).rejects.toMatchObject({ code: "sse_state_too_large" });
    });
});
