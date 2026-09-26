import { describe, expect, it, vi } from "vitest";
import { transformStream } from "../index";
import { transformStream as transformLegacyGoogleStream } from "../../../google/text-generate";

const args: any = { requestId: "google-safety", providerId: "google-ai-studio", ir: { model: "gemini", messages: [] }, protocol: "openai.chat.completions" };
const candidate = (text: string, finishReason?: string) => ({ candidates: [{ index: 0, content: { parts: [{ text }] }, finishReason }] });
const frame = (payload: unknown) => `data: ${JSON.stringify(payload)}\n\n`;
const read = (body: string, source?: "gateway" | "byok") => new Response(transformStream(new Response(body).body!, args, source)).text();

describe("bounded native Gemini stream", () => {
    it("shares the parser across Google and AI Studio", () => {
        expect(transformLegacyGoogleStream).toBe(transformStream);
    });
    it("preserves split Unicode/CRLF/multiline data and final usage", async () => {
        const payload = JSON.stringify(candidate("Hello 🌍", "STOP"));
        const text = `data: ${payload.slice(0, 1)}\r\ndata: ${payload.slice(1)}\r\n\r\n`
            + frame({ usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2, totalTokenCount: 5 } });
        const bytes = new TextEncoder().encode(text); let at = 0;
        const stream = new ReadableStream<Uint8Array>({ pull(controller) {
            if (at < bytes.length) controller.enqueue(bytes.slice(at, ++at)); else controller.close();
        } });
        const output = await new Response(transformStream(stream, args)).text();
        expect(output).toContain("Hello 🌍"); expect(output).toContain('"total_tokens":5');
        expect(output.match(/data: \[DONE\]/g)).toHaveLength(1); expect(stream.locked).toBe(false);
    });
    it.each([
        frame(candidate("partial")),
        frame(candidate("partial")) + "data: [DONE]\n\n",
        frame(candidate("partial")) + frame(candidate("", "STOP")).trimEnd(),
        frame({ event_type: "step.delta", index: 0, delta: { type: "text", text: "partial" } }),
        frame({ candidates: [{ index: 0, finishReason: "STOP", content: { parts: [{ text: "done" }] } }, { index: 1, content: { parts: [{ text: "unfinished" }] } }] }),
    ])("rejects missing native completion, including a supplied DONE", async body => {
        await expect(read(body)).rejects.toMatchObject({ code: "sse_missing_terminal" });
    });
    it("fails malformed events instead of dropping output", async () => {
        await expect(read('data: {bad}\n\n')).rejects.toMatchObject({ code: "sse_invalid_json" });
    });
    it("keeps BYOK errors neutral and excludes private provider messages", async () => {
        await expect(read(frame({ error: { code: 429, message: "private credential context" } }), "byok"))
            .rejects.toMatchObject({ origin: "provider", status: 429, healthImpact: "neutral" });
        try { await read(frame({ error: { code: 403, message: "private credential context" } })); }
        catch (error) { expect(String(error)).not.toContain("private credential context"); }
    });
    it("supports bounded JSON fallback, including arrays of chunks", async () => {
        const output = await read(JSON.stringify([candidate("JSON", "STOP")]));
        expect(output).toContain("JSON"); expect(output).toContain("[DONE]");
    });
    it("retains tool finish state for a later finish-only event", async () => {
        const tool = (partialArgs: string) => ({ candidates: [{ index: 0, content: { parts: [{ functionCall: { name: "weather", partialArgs } }] } }] });
        const output = await read(frame(tool('{"city":')) + frame(tool('"London"}')) + frame({ candidates: [{ index: 0, finishReason: "STOP" }] }));
        expect(output).toContain('"finish_reason":"tool_calls"');
        expect(output.match(/"name":"weather"/g)).toHaveLength(1);
    });
    it("rejects divergent tool snapshots and sparse/unbounded state", async () => {
        const tool = (value: number) => ({ candidates: [{ content: { parts: [{ functionCall: { name: "tool", args: { value } } }] } }] });
        await expect(read(frame(tool(1)) + frame(tool(2)))).rejects.toMatchObject({ code: "sse_invalid_tool_delta" });
        await expect(read(frame({ candidates: [{ index: 128 }] }))).rejects.toMatchObject({ code: "sse_state_too_large" });
        await expect(read(frame({ event_type: "step.start", index: -1, step: { type: "function_call" } }))).rejects.toMatchObject({ code: "sse_state_too_large" });
        await expect(read(frame(new Array(129).fill({})))).rejects.toMatchObject({ code: "sse_state_too_large" });
    });
    it("does not read before demand and cancels/releases a pending sniff", async () => {
        const pull = vi.fn(), cancel = vi.fn();
        const source = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 });
        const output = transformStream(source, args);
        await Promise.resolve(); expect(pull).not.toHaveBeenCalled();
        const reader = output.getReader(); const pending = reader.read();
        await vi.waitFor(() => expect(pull).toHaveBeenCalledTimes(1));
        await reader.cancel(); await pending;
        expect(cancel).toHaveBeenCalledTimes(1); expect(source.locked).toBe(false);
    });
    it("bounds retained tool arguments but does not accumulate plain output", async () => {
        const tool = (partialArgs: string) => ({ candidates: [{ content: { parts: [{ functionCall: { name: "tool", partialArgs } }] } }] });
        const argumentPart = "x".repeat(1024 * 1024);
        await expect(read(new Array(5).fill(frame(tool(argumentPart))).join("")))
            .rejects.toMatchObject({ code: "sse_state_too_large" });
        let sent = 0;
        const source = new ReadableStream<Uint8Array>({ pull(controller) {
            if (sent++ < 6) controller.enqueue(new TextEncoder().encode(frame(candidate(argumentPart))));
            else if (sent === 8) controller.close();
            else controller.enqueue(new TextEncoder().encode(frame({ candidates: [{ finishReason: "STOP" }] })));
        } }, { highWaterMark: 0 });
        const reader = transformStream(source, args).getReader(); let bytes = 0;
        while (true) { const next = await reader.read(); if (next.done) break; bytes += next.value.length; }
        expect(bytes).toBeGreaterThan(6 * 1024 * 1024); expect(source.locked).toBe(false);
    });
    it("stops a pending SSE read after delivering the first chunk", async () => {
        const cancel = vi.fn(); let sent = false;
        const source = new ReadableStream<Uint8Array>({ pull(controller) {
            if (!sent) { sent = true; controller.enqueue(new TextEncoder().encode(frame(candidate("hello")))); }
        }, cancel }, { highWaterMark: 0 });
        const reader = transformStream(source, args).getReader();
        expect((await reader.read()).done).toBe(false);
        const pending = reader.read(); await Promise.resolve(); await reader.cancel(); await pending;
        expect(cancel).toHaveBeenCalledTimes(1); expect(source.locked).toBe(false);
    });
});
