import { describe, expect, it, vi } from "vitest";
import { observeAnthropicStream } from "../stream-usage";
import { createAnthropicToResponsesStreamTransformer } from "../stream-transformer";
import { bufferAnthropicStreamToMessage } from "../index";
import { normalizeTextUsageForPricing } from "@executors/_shared/usage/text";
import Anthropic from "@anthropic-ai/sdk";

const start = { type: "message_start", message: { id: "msg_native", usage: {
    input_tokens: 120, output_tokens: 0, cache_read_input_tokens: 20, cache_creation_input_tokens: 80,
    cache_creation: { ephemeral_5m_input_tokens: 30, ephemeral_1h_input_tokens: 50 }, server_tool_use: { web_search_requests: 2 },
} } };
const content = { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } };
const delta = { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello 🌍" } };
const usage = { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 17 } };
const stop = { type: "message_stop" };
const sse = (events: unknown[], ending = "\n") => events.map(event => `data: ${JSON.stringify(event)}${ending}${ending}`).join("");
const source = (events: unknown[]) => new Response(sse(events)).body!;
async function transformed(body: ReadableStream<Uint8Array>, credentialSource?: "byok" | "gateway") {
    const text = await new Response(body.pipeThrough(createAnthropicToResponsesStreamTransformer("request", "claude", credentialSource))).text();
    return text.split("\n").filter(line => line.startsWith("data: ")).map(line => JSON.parse(line.slice(6)));
}

describe("bounded Anthropic stream paths", () => {
    it.each(["\r\n", "\r", "\n"])("handles one-byte UTF-8 chunks and %j framing", async ending => {
        const bytes = new TextEncoder().encode("\uFEFF" + sse([start, content, delta, usage, stop], ending));
        let at = 0;
        const input = new ReadableStream<Uint8Array>({ pull(controller) {
            if (at < bytes.length) controller.enqueue(bytes.slice(at, ++at)); else controller.close();
        } });
        const events = await transformed(input);
        expect(events.find(event => event.type === "response.output_text.delta").delta).toBe("Hello 🌍");
        expect(events.at(-1)).toMatchObject({ type: "response.completed", response: { status: "completed" } });
        expect(events.map(event => event.sequence_number)).toEqual(events.map((_, index) => index));
        expect(input.locked).toBe(false);
    });

    it("preserves all authoritative pricing meters in the translated terminal", async () => {
        const events = await transformed(source([start, content, delta, usage, stop]));
        const meters = normalizeTextUsageForPricing(events.at(-1).response.usage);
        expect(meters).toMatchObject({ input_text_tokens: 120, output_text_tokens: 17,
            cached_read_text_tokens: 20, cached_write_text_tokens: 80, cached_write_text_tokens_5m: 30,
            cached_write_text_tokens_1h: 50, native_web_search_requests: 2 });
    });

    it("emits incomplete rather than completed for a token limit", async () => {
        const events = await transformed(source([start, { ...usage, delta: { stop_reason: "max_tokens" } }, stop]));
        expect(events.at(-1)).toMatchObject({ type: "response.incomplete", response: {
            status: "incomplete", incomplete_details: { reason: "max_output_tokens" } } });
        expect(events.some(event => event.type === "response.completed")).toBe(false);
    });

    it("does not accept partial data or a bare DONE as native completion", async () => {
        for (const body of [sse([start, content, delta]), sse([start]) + "data: [DONE]\n\n", "data: {bad}\n\n", "data: null\n\n"]) {
            await expect(transformed(new Response(body).body!)).rejects.toThrow(/^sse_/);
            await expect(bufferAnthropicStreamToMessage(new Response(body), Date.now())).rejects.toThrow(/^sse_/);
            await expect(new Response(observeAnthropicStream(new Response(body).body!).stream).text()).rejects.toThrow(/^sse_/);
        }
    });

    it("limits retained compatibility output and block indices", async () => {
        const oversized = [start, content, ...Array.from({ length: 5 }, () => ({ ...delta, delta: { type: "text_delta", text: "x".repeat(1024 * 1024) } })), stop];
        await expect(transformed(source(oversized))).rejects.toMatchObject({ code: "sse_state_too_large" });
        await expect(bufferAnthropicStreamToMessage(new Response(sse(oversized)), Date.now())).rejects.toMatchObject({ code: "sse_state_too_large" });
        for (const index of [-1, 128, 1.5]) {
            await expect(transformed(source([start, { ...content, index }, stop]))).rejects.toMatchObject({ code: "sse_invalid_tool_delta" });
            await expect(bufferAnthropicStreamToMessage(new Response(sse([start, { ...content, index }, stop])), Date.now())).rejects.toMatchObject({ code: "sse_invalid_tool_delta" });
        }
    });

    it("retains native unknown blocks/signatures without accumulating output for accounting", async () => {
        const native = { type: "content_block_start", index: 1, content_block: { type: "redacted_thinking", data: "opaque_signature" } };
        const observed = observeAnthropicStream(source([start, native, usage, stop]));
        const text = await new Response(observed.stream).text();
        expect(text).toContain('"data":"opaque_signature"');
        expect(observed.finalUsage()).toEqual({ usage: { ...start.message.usage, output_tokens: 17 }, stopReason: "end_turn" });
        const first = observed.finalUsage(); (first.usage.cache_creation as any).ephemeral_5m_input_tokens = 99;
        expect((observed.finalUsage().usage.cache_creation as any).ephemeral_5m_input_tokens).toBe(30);
    });

    it("rejects malformed or oversized usage state instead of treating it as settled", async () => {
        const observed = observeAnthropicStream(source([{ ...usage, usage: { field: "x".repeat(17_000) } }, stop]));
        await expect(new Response(observed.stream).text()).rejects.toMatchObject({ code: "sse_state_too_large" });
        expect(observed.finalUsage).toThrow("sse_missing_terminal");
    });

    it("preserves provider error ownership including BYOK-neutral authentication failure", async () => {
        const error = { type: "error", error: { type: "authentication_error", message: "do not retain secret" } };
        for (const credentialSource of ["gateway", "byok"] as const) {
            const expected = { status: 401, origin: "provider", healthImpact: credentialSource === "byok" ? "neutral" : "failure" };
            await expect(transformed(source([start, error]), credentialSource)).rejects.toMatchObject(expected);
            const observed = observeAnthropicStream(source([start, error]), credentialSource);
            await expect(new Response(observed.stream).text()).rejects.toMatchObject(expected);
            expect(observed.finalUsage).toThrow("sse_missing_terminal");
        }
    });

    it("does not pull or buffer the native source without downstream demand; cancellation releases it", async () => {
        const pull = vi.fn(), cancel = vi.fn();
        const input = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 });
        const observed = observeAnthropicStream(input);
        await Promise.resolve(); expect(pull).not.toHaveBeenCalled();
        const reader = observed.stream.getReader();
        const reading = reader.read();
        await vi.waitFor(() => expect(pull).toHaveBeenCalledTimes(1));
        await reader.cancel(); await reading;
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(input.locked).toBe(false);
        expect(observed.finalUsage).toThrow("sse_missing_terminal");
    });

    it("materializes bounded nonstream output with the same native usage and terminal", async () => {
        const result = await bufferAnthropicStreamToMessage(new Response(sse([start, content, delta, usage, stop], "\r\n")), Date.now());
        expect(result.message).toMatchObject({ id: "msg_native", content: [{ type: "text", text: "Hello 🌍" }],
            usage: { input_tokens: 120, output_tokens: 17, cache_read_input_tokens: 20, cache_creation_input_tokens: 80 } });
    });

    it("preserves a native tool call through the installed Anthropic SDK", async () => {
        const events = [
            { ...start, message: { ...start.message, type: "message", role: "assistant", model: "claude", content: [], stop_reason: null, stop_sequence: null } },
            { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tool_native", name: "lookup", input: {} } },
            { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"city":"London"}' } },
            { type: "content_block_stop", index: 0 }, { ...usage, delta: { stop_reason: "tool_use", stop_sequence: null } }, stop,
        ];
        const observed = observeAnthropicStream(source(events));
        const client = new Anthropic({ apiKey: "test-only", maxRetries: 0, fetch: async () => new Response(observed.stream,
            { headers: { "content-type": "text/event-stream" } }) });
        const message = await client.messages.stream({ model: "claude", max_tokens: 20, messages: [{ role: "user", content: "test" }] }).finalMessage();
        expect(message.content).toEqual([{ type: "tool_use", id: "tool_native", name: "lookup", input: { city: "London" } }]);
        expect(message.usage).toMatchObject({ input_tokens: 120, output_tokens: 17, cache_read_input_tokens: 20, cache_creation_input_tokens: 80 });
        expect(message.stop_reason).toBe("tool_use");
    });
});
