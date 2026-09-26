import { afterEach, describe, expect, it, vi } from "vitest";
import { hasExplicitZeroUsage, prepareStreamAdmission, supportsZeroUsageReplay } from "./stream-admission";

const zero = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
const error = { error: { type: "api_error" }, usage: zero };
const preamble = { object: "chat.completion.chunk", choices: [{ delta: { role: "assistant", content: "" } }] };
const output = { object: "chat.completion.chunk", choices: [{ delta: { content: "hello" } }] };
const wire = (...frames: unknown[]) => frames.map(frame => `data: ${typeof frame === "string" ? frame : JSON.stringify(frame)}\n\n`).join("");
const source = (...frames: unknown[]) => new Response(wire(...frames)).body!;
afterEach(() => vi.useRealTimers());

describe("pre-output stream admission", () => {
    it("retries only a complete zero-usage failure, preserving the stream for other consumers", async () => {
        const result = await prepareStreamAdmission(source(preamble, error, "[DONE]"));
        expect(result.retryableZeroUsage).toBe(true);
        expect(result.failure?.status).toBe(500);
        expect(await new Response(result.stream).text()).toBe(wire(preamble, error, "[DONE]"));
    });

    it.each([undefined, {}, { input_tokens: 0 }, { ...zero, total_tokens: 1 },
        { ...zero, cached_tokens: 1 }, { ...zero, output_tokens: "0" }])("does not infer safe replay from %j", async usage => {
        const result = await prepareStreamAdmission(source({ ...error, usage }));
        expect(result.retryableZeroUsage).toBe(false);
        await result.stream.cancel();
    });

    it.each([
        [output, error],
        [{ ...preamble, usage: { input_tokens: 1 } }, error],
        [error, { usage: zero }],
        [{ error: { type: "authentication_error" }, usage: zero }],
        ["{bad json", error],
    ])("does not replay output, conflicting evidence, or nonretryable errors", async (...frames) => {
        const result = await prepareStreamAdmission(source(...frames));
        expect(result.retryableZeroUsage).toBe(false);
        expect(await new Response(result.stream).text()).toBe(wire(...frames));
    });

    it("bounds metadata inspection", async () => {
        const result = await prepareStreamAdmission(source(...Array(16).fill(preamble), error));
        expect(result.retryableZeroUsage).toBe(false);
        await result.stream.cancel();
    });

    it("preserves transport errors instead of retrying unknown usage", async () => {
        const result = await prepareStreamAdmission(new ReadableStream({ start(c) { c.error(new Error("disconnected")); } }));
        expect(result.retryableZeroUsage).toBe(false);
        await expect(new Response(result.stream).text()).rejects.toThrow("disconnected");
    });

    it("deadline preserves pending read and cancellation releases the source", async () => {
        vi.useFakeTimers();
        const cancel = vi.fn();
        const upstream = new ReadableStream<Uint8Array>({ cancel }, { highWaterMark: 0 });
        const pending = prepareStreamAdmission(upstream);
        await vi.advanceTimersByTimeAsync(100);
        const result = await pending;
        expect(result.retryableZeroUsage).toBe(false);
        await result.stream.cancel("client_left");
        expect(cancel).toHaveBeenCalledOnce();
        expect(upstream.locked).toBe(false);
    });

    it("does not lose a first frame arriving after the deadline", async () => {
        vi.useFakeTimers();
        let controller!: ReadableStreamDefaultController<Uint8Array>;
        const pending = prepareStreamAdmission(new ReadableStream({ start(c) { controller = c; } }));
        await vi.advanceTimersByTimeAsync(100);
        const result = await pending;
        controller.enqueue(new TextEncoder().encode(wire(output, "[DONE]")));
        controller.close();
        expect(await new Response(result.stream).text()).toBe(wire(output, "[DONE]"));
    });

    it("requires EOF after zero-usage error, not just a quiet upstream", async () => {
        vi.useFakeTimers();
        const pending = prepareStreamAdmission(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(wire(error))); } }));
        await vi.advanceTimersByTimeAsync(100);
        const result = await pending;
        expect(result.retryableZeroUsage).toBe(false);
        await result.stream.cancel();
    });

    it("accepts explicit alternate usage fields but bounds nested evidence", () => {
        expect(hasExplicitZeroUsage({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 })).toBe(true);
        expect(hasExplicitZeroUsage({ ...zero, details: Object.fromEntries(Array.from({ length: 129 }, (_, n) => [n, 0])) })).toBe(false);
    });

    it("excludes tools, media, unknown prices and fixed fees", () => {
        const ir = { messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }] };
        const card = { rules: [{ meter: "input_tokens" }, { meter: "output_tokens" }] };
        expect(supportsZeroUsageReplay(ir, card)).toBe(true);
        expect(supportsZeroUsageReplay({ ...ir, tools: [{}] }, card)).toBe(false);
        expect(supportsZeroUsageReplay({ messages: [{ role: "tool", content: [] }] }, card)).toBe(false);
        expect(supportsZeroUsageReplay({ messages: [{ role: "user", content: [{ type: "image" }] }] }, card)).toBe(false);
        expect(supportsZeroUsageReplay(ir, { rules: [] })).toBe(false);
        expect(supportsZeroUsageReplay(ir, { rules: [{ meter: "requests" }] })).toBe(false);
    });
});
