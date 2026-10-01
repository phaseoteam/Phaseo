import { describe, expect, it } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
import { transformResponsesStreamToChat } from "../stream-transforms";
import { passthroughWithPricing } from "@pipeline/after/streaming";

const args = { providerId: "poolside", requestId: "req-bridge", ir: { model: "test", messages: [] } } as unknown as ExecutorExecuteArgs;
const frame = (type: string, fields: object = {}) => `data: ${JSON.stringify({ type, ...fields })}\r\n\r\n`;
const terminal = (status = "completed") => frame(`response.${status}`, { response: {
    id: "native", object: "response", status, model: "test", output: [],
    usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 },
} });
function bridge(source: ReadableStream<Uint8Array>) {
    return transformResponsesStreamToChat(source, args, { requestId: args.requestId, providerId: args.providerId, choiceStates: new Map() });
}
const convert = (text: string) => new Response(bridge(new Response(text).body!)).text();
const jsonFrames = (text: string) => text.split("\n\n").filter(line => line.startsWith("data: {")).map(line => JSON.parse(line.slice(6)));
const item = (id = "item", callId = "call") => frame("response.output_item.added", { item: { type: "function_call", id, call_id: callId, name: "lookup", arguments: "" } });

describe("bounded Responses to Chat bridge", () => {
    it("preserves split UTF-8/CRLF and payload-only event types", async () => {
        const bytes = new TextEncoder().encode(frame("response.output_text.delta", { delta: "Hello 🌍" }) + terminal());
        let offset = 0;
        const source = new ReadableStream<Uint8Array>({ pull(controller) {
            if (offset === bytes.length) controller.close();
            else controller.enqueue(bytes.slice(offset, ++offset));
        } });
        const text = await new Response(bridge(source)).text();
        expect(jsonFrames(text)[0].choices[0].delta.content).toBe("Hello 🌍");
        expect(text.match(/\[DONE\]/g)).toHaveLength(1);
        expect(source.locked).toBe(false);
    });

    it.each(["completed", "incomplete"])("ends once at response.%s and ignores later frames", async status => {
        const text = await convert(terminal(status) + frame("response.output_text.delta", { delta: "late" }) + terminal());
        expect(text.match(/\[DONE\]/g)).toHaveLength(1);
        expect(text).not.toContain("late");
        expect(jsonFrames(text)).toHaveLength(1);
    });

    it("reconstructs tool IDs, names and argument fragments without duplicated snapshots", async () => {
        const text = await convert(item()
            + frame("response.function_call_arguments.delta", { item_id: "item", delta: '{"city":' })
            + frame("response.function_call_arguments.delta", { item_id: "item", delta: '"SF"}' })
            + frame("response.function_call_arguments.done", { item_id: "item", name: "lookup", arguments: '{"city":"SF"}' })
            + frame("response.output_item.done", { item: { type: "function_call", id: "item", call_id: "call", name: "lookup", arguments: '{"city":"SF"}' } })
            + terminal());
        const deltas = jsonFrames(text).flatMap(chunk => chunk.choices?.[0]?.delta?.tool_calls ?? []);
        expect(deltas).toHaveLength(3);
        expect(deltas.map(delta => delta.id ?? "").join("")).toBe("call");
        expect(deltas.map(delta => delta.function.name ?? "").join("")).toBe("lookup");
        expect(deltas.map(delta => delta.function.arguments).join("")).toBe('{"city":"SF"}');
        expect(deltas.every(delta => delta.index === 0)).toBe(true);
    });

    it.each([
        ["malformed JSON", "data: {broken}\n\n", "sse_invalid_json"],
        ["bare EOF", frame("response.output_text.delta", { delta: "partial" }), "sse_missing_terminal"],
        ["Chat marker on Responses wire", "data: [DONE]\n\n", "sse_missing_terminal"],
        ["oversized identity", item("x".repeat(1025)), "sse_state_too_large"],
        ["argument prefix drift", item() + frame("response.function_call_arguments.delta", { item_id: "item", delta: "one" }) + frame("response.function_call_arguments.done", { item_id: "item", arguments: "two" }), "sse_invalid_tool_delta"],
        ["alias collision", item("item", "call1") + item("item", "call2"), "sse_invalid_tool_delta"],
        ["too many tools", Array.from({ length: 129 }, (_, i) => item(`item${i}`, `call${i}`)).join(""), "sse_state_too_large"],
    ])("rejects %s without manufacturing success", async (_label, wire, code) => {
        await expect(convert(wire)).rejects.toMatchObject({ code });
    });

    it("propagates upstream read errors and releases ownership", async () => {
        const source = new ReadableStream<Uint8Array>({ pull(controller) { controller.error(new Error("read failed")); } });
        await expect(new Response(bridge(source)).text()).rejects.toThrow("read failed");
        expect(source.locked).toBe(false);
    });

    it("does not eagerly read and cancels a blocked upstream read", async () => {
        let pulls = 0, cancels = 0;
        const source = new ReadableStream<Uint8Array>({ pull() { pulls++; }, cancel() { cancels++; } }, { highWaterMark: 0 });
        const reader = bridge(source).getReader();
        await Promise.resolve(); expect(pulls).toBe(0);
        const pending = reader.read();
        await new Promise(resolve => setTimeout(resolve, 0));
        await reader.cancel(); await pending;
        expect(pulls).toBe(1); expect(cancels).toBe(1); expect(source.locked).toBe(false);
    });

    it("emits a provider failure without a success marker", async () => {
        const text = await convert(frame("response.failed", { response: { error: { code: "rate_limit_exceeded", message: "Limited" } } }));
        expect(jsonFrames(text)).toEqual([{ object: "error", error: { code: "rate_limit_exceeded", message: "Limited" } }]);
        expect(text).not.toContain("[DONE]");
    });

    it("preserves one terminal and one usage callback through the after-stage", async () => {
        const outcomes: unknown[] = [];
        const response = await passthroughWithPricing({
            upstream: new Response(bridge(new Response(terminal()).body!)),
            ctx: { requestId: args.requestId, workspaceId: "test", protocol: "openai.chat.completions", meta: {} } as any,
            provider: "poolside", priceCard: null, onFinalUsage: (usage, info) => { outcomes.push({ usage, info }); },
        });
        expect((await response.text()).match(/\[DONE\]/g)).toHaveLength(1);
        expect(outcomes).toHaveLength(1);
        expect(outcomes[0]).toMatchObject({ usage: { total_tokens: 3 }, info: { aborted: false, sawFinalUsage: true } });
    });
});
