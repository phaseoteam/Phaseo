import { describe, expect, it, vi } from "vitest";
import { readSseEvents, sseReadable } from "./sse";

const encoder = new TextEncoder();
function bytes(chunks: Uint8Array[]) {
    return new ReadableStream<Uint8Array>({ start(controller) {
        chunks.forEach(chunk => controller.enqueue(chunk)); controller.close();
    } });
}
async function collect(stream: ReadableStream<Uint8Array>, maxEventChars?: number) {
    const events = [];
    for await (const event of readSseEvents(stream, { maxEventChars })) events.push(event);
    return events;
}

describe("bounded SSE framing", () => {
    it.each(["\n", "\r\n", "\r"])("preserves multiline data and UTF-8 with %j at every split", async newline => {
        const source = encoder.encode(`\uFEFF: keepalive${newline}id: event-1${newline}event: delta${newline}data: hello 🌍${newline}data:  second${newline}${newline}`);
        for (let split = 1; split < source.length; split++) {
            expect(await collect(bytes([source.slice(0, split), source.slice(split)]))).toEqual([
                { id: "event-1", event: "delta", data: "hello 🌍\n second" },
            ]);
        }
    });

    it("does not manufacture an event from incomplete EOF", async () => {
        for (const source of ["data: incomplete", "data: incomplete\n", "data: incomplete\r"]) {
            expect(await collect(bytes([encoder.encode(source)]))).toEqual([]);
        }
    });

    it("ignores comments, extensions, and retry without reconnecting", async () => {
        const source = ": ping\nretry: nonsense\nfuture: field\ndata: yes\n\n";
        expect(await collect(bytes([encoder.encode(source)]))).toEqual([{ id: undefined, event: undefined, data: "yes" }]);
    });

    it.each(["data: " + "x".repeat(65), "data: " + "x".repeat(65) + "\n\n", "data: x\n".repeat(65)])(
        "bounds partial lines, complete events and multiline accumulation", async source => {
            await expect(collect(bytes([encoder.encode(source)]), 64)).rejects.toThrow("sse_frame_too_large");
        },
    );

    it("splits a large input chunk into bounded event batches", async () => {
        const source = "data: x\n\n".repeat(10000);
        expect(await collect(bytes([encoder.encode(source)]))).toHaveLength(10000);
    });

    it("rejects invalid or truncated UTF-8 without payload disclosure", async () => {
        for (const source of [new Uint8Array([0xff]), new Uint8Array([0xf0, 0x9f])]) {
            await expect(collect(bytes([source]))).rejects.toThrow("sse_invalid_utf8");
        }
    });

    it("releases the source reader and propagates transport failure", async () => {
        const source = new ReadableStream<Uint8Array>({ pull(controller) { controller.error(new Error("transport failure")); } });
        await expect(collect(source)).rejects.toThrow("transport failure");
        expect(source.locked).toBe(false);
    });

    it("does not eagerly consume output and interrupts a pending read on cancel", async () => {
        let pulls = 0;
        const cancel = vi.fn();
        const source = new ReadableStream<Uint8Array>({ pull() { pulls++; }, cancel }, { highWaterMark: 0 });
        const output = sseReadable(async function* (signal) {
            for await (const event of readSseEvents(source, { signal })) yield encoder.encode(event.data);
        });
        await Promise.resolve(); expect(pulls).toBe(0);
        const reader = output.getReader();
        const pending = reader.read();
        await vi.waitFor(() => expect(pulls).toBe(1));
        await reader.cancel("client disconnected");
        await pending;
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(source.locked).toBe(false);
    });

    it("cancels and releases a source when its consumer stops early", async () => {
        const cancel = vi.fn();
        const source = new ReadableStream<Uint8Array>({
            start(controller) { controller.enqueue(encoder.encode("data: first\n\ndata: second\n\n")); }, cancel,
        });
        for await (const event of readSseEvents(source)) { expect(event.data).toBe("first"); break; }
        expect(cancel).toHaveBeenCalledTimes(1); expect(source.locked).toBe(false);
    });
});
