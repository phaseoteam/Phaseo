import { describe, expect, it, vi } from "vitest";
import { readBoundedUpstreamJson, sniffUpstreamBody } from "./upstream-body";

function chunked(text: string) {
    const bytes = new TextEncoder().encode(text); let at = 0;
    return new ReadableStream<Uint8Array>({ pull(controller) {
        if (at < bytes.length) controller.enqueue(bytes.slice(at, ++at)); else controller.close();
    } });
}
describe("bounded upstream body detection", () => {
    it("sniffs split BOM/whitespace JSON and preserves all prefix bytes", async () => {
        const source = chunked('\uFEFF \n {"text":"Hello 🌍"}');
        const result = await sniffUpstreamBody(source);
        expect(result.kind).toBe("json");
        expect(await readBoundedUpstreamJson(result.stream)).toEqual({ text: "Hello 🌍" });
        expect(source.locked).toBe(false);
    });
    it("replays SSE exactly without collecting the response", async () => {
        const text = ': ping\r\ndata: {"hello":true}\r\n\r\n';
        const result = await sniffUpstreamBody(chunked(text));
        expect(result.kind).toBe("sse");
        expect(await new Response(result.stream).text()).toBe(text);
    });
    it("bounds detection whitespace and JSON bytes, cancelling and releasing the source", async () => {
        const long = chunked(" ".repeat(4097));
        await expect(sniffUpstreamBody(long)).rejects.toMatchObject({ code: "sse_frame_too_large" });
        expect(long.locked).toBe(false);
        const cancel = vi.fn();
        const source = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('{"big":"' + "x".repeat(100) + '"}')); }, cancel });
        await expect(readBoundedUpstreamJson(source, 50)).rejects.toMatchObject({ code: "sse_state_too_large" });
        expect(cancel).toHaveBeenCalledTimes(1); expect(source.locked).toBe(false);
    });
    it("rejects bad UTF-8 and malformed JSON and releases locks", async () => {
        const invalid = new Response(new Uint8Array([0xff])).body!;
        await expect(sniffUpstreamBody(invalid)).rejects.toMatchObject({ code: "sse_invalid_utf8" });
        expect(invalid.locked).toBe(false);
        await expect(readBoundedUpstreamJson(chunked('{"oops":'))).rejects.toMatchObject({ code: "sse_invalid_json" });
    });
    it("cancels the underlying source if the consumer stops after sniffing", async () => {
        const cancel = vi.fn();
        const source = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('data: ')); }, cancel });
        const result = await sniffUpstreamBody(source);
        await result.stream.cancel();
        expect(cancel).toHaveBeenCalledTimes(1); expect(source.locked).toBe(false);
    });
});
