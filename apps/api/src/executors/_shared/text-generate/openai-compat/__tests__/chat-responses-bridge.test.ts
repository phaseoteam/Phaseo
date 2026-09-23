import { describe, expect, it } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
import { transformChatStreamToResponses } from "../stream-transforms";

const args = { providerId: "poolside", requestId: "bridge", ir: { model: "test", messages: [] } } as unknown as ExecutorExecuteArgs;
const frame = (payload: unknown) => `data: ${JSON.stringify(payload)}\r\n\r\n`;
const chunk = (delta: object, finish: string | null = null) => frame({ object: "chat.completion.chunk", id: "native", choices: [{ index: 0, delta, finish_reason: finish }] });
const done = "data: [DONE]\r\n\r\n";
function bridge(source: ReadableStream<Uint8Array>) {
    return transformChatStreamToResponses(source, args, { requestId: args.requestId, providerId: args.providerId, choiceStates: new Map() });
}
const convert = (text: string) => new Response(bridge(new Response(text).body!)).text();
const frames = (text: string) => text.trim().split("\n\n").map(event => JSON.parse(event.split("\n").find(line => line.startsWith("data:"))!.slice(6)));

describe("bounded Chat-to-Responses framing", () => {
    it("handles one-byte UTF-8 and CRLF and emits exactly one terminal at DONE", async () => {
        const bytes = new TextEncoder().encode(chunk({ content: "Hello 🌍" }, "stop") + done + chunk({ content: "late" }));
        let offset = 0;
        const source = new ReadableStream<Uint8Array>({ pull(controller) {
            if (offset === bytes.length) controller.close(); else controller.enqueue(bytes.slice(offset, ++offset));
        } });
        const output = frames(await new Response(bridge(source)).text());
        expect(output.filter(event => event.type === "response.completed")).toHaveLength(1);
        expect(output.find(event => event.type === "response.output_text.delta").delta).toBe("Hello 🌍");
        expect(JSON.stringify(output)).not.toContain("late"); expect(source.locked).toBe(false);
    });

    it("does not convert usage plus finish_reason into success without DONE", async () => {
        await expect(convert(chunk({ content: "partial" }, "stop") + frame({ choices: [], usage: { total_tokens: 3 } })))
            .rejects.toMatchObject({ code: "sse_missing_terminal" });
    });

    it.each([
        ["invalid JSON", "data: broken\n\n", "sse_invalid_json"],
        ["bare marker", done, "sse_missing_terminal"],
        ["sparse choice index", frame({ choices: [{ index: 2 ** 30, delta: { content: "x" } }] }), "sse_state_too_large"],
        ["sparse tool index", chunk({ tool_calls: [{ index: 2 ** 30, function: { arguments: "x" } }] }), "sse_state_too_large"],
        ["retained compatibility output", chunk({ content: "x".repeat(3 * 1024 * 1024) }) + chunk({ content: "y".repeat(2 * 1024 * 1024) }), "sse_state_too_large"],
    ])("rejects %s", async (_label, wire, code) => {
        await expect(convert(wire)).rejects.toMatchObject({ code });
    });

    it("does not eagerly read, and cancellation interrupts a pending read", async () => {
        let pulls = 0, cancels = 0;
        const source = new ReadableStream<Uint8Array>({ pull() { pulls++; }, cancel() { cancels++; } }, { highWaterMark: 0 });
        const reader = bridge(source).getReader();
        await Promise.resolve(); expect(pulls).toBe(0);
        const pending = reader.read(); await new Promise(resolve => setTimeout(resolve, 0));
        await reader.cancel(); await pending;
        expect(pulls).toBe(1); expect(cancels).toBe(1); expect(source.locked).toBe(false);
    });

    it("does not read ahead while an emitted frame is backpressured", async () => {
        let pulls = 0;
        const source = new ReadableStream<Uint8Array>({ pull(controller) {
            pulls++; controller.enqueue(new TextEncoder().encode(chunk({ content: "x" })));
        } }, { highWaterMark: 0 });
        const reader = bridge(source).getReader();
        await reader.read(); // created
        await new Promise(resolve => setTimeout(resolve, 0)); expect(pulls).toBe(1);
        await reader.read(); // delta from the same frame
        await new Promise(resolve => setTimeout(resolve, 0)); expect(pulls).toBe(1);
        await reader.cancel(); expect(source.locked).toBe(false);
    });

    it("propagates transport failure rather than a synthetic completed response", async () => {
        let reads = 0;
        const source = new ReadableStream<Uint8Array>({ pull(controller) {
            if (reads++ === 0) controller.enqueue(new TextEncoder().encode(chunk({ content: "partial" })));
            else controller.error(new Error("transport failed"));
        } });
        await expect(new Response(bridge(source)).text()).rejects.toThrow("transport failed");
        expect(source.locked).toBe(false);
    });

    it("uses payload event types for native Responses passthrough and stops on terminal", async () => {
        const output = frames(await convert(frame({ type: "response.created", response: { id: "r" } })
            + frame({ type: "response.completed", response: { id: "r", status: "completed" } })
            + frame({ type: "response.output_text.delta", delta: "late" })));
        expect(output.map(event => event.type)).toEqual(["response.created", "response.completed"]);
    });

    it("reports native Chat errors as Responses error events", async () => {
        const output = frames(await convert(frame({ error: { code: "limited", message: "Please retry" } })));
        expect(output).toEqual([{ type: "error", sequence_number: 0, code: "limited", message: "Please retry", param: null }]);
    });

    it("does not duplicate initial tool arguments between item-added and deltas", async () => {
        const output = frames(await convert(chunk({ tool_calls: [{ index: 0, id: "call", function: { name: "lookup", arguments: '{"x":' } }] })
            + chunk({ tool_calls: [{ index: 0, function: { arguments: "1}" } }] }, "tool_calls") + done));
        const added = output.find(event => event.type === "response.output_item.added");
        const deltas = output.filter(event => event.type === "response.function_call_arguments.delta");
        expect(added.item.arguments + deltas.map(event => event.delta).join("")).toBe('{"x":1}');
        expect(output.find(event => event.type === "response.function_call_arguments.done").arguments).toBe('{"x":1}');
    });
});
