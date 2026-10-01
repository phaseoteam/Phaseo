import { createParser, type EventSourceMessage } from "eventsource-parser";

export class SseProtocolError extends Error {
    constructor(readonly code: "sse_frame_too_large" | "sse_chunk_too_large" | "sse_invalid_utf8" | "sse_invalid_json" | "sse_missing_terminal") {
        super(code); this.name = "SseProtocolError";
    }
}

const MAX_EVENT_CHARS = 4 * 1024 * 1024;
const MAX_CHUNK_BYTES = 16 * 1024 * 1024;
const FEED_BYTES = 4096;

/** One output chunk per pull; cancellation interrupts a pending source read. */
export function sseReadable(generate: (signal: AbortSignal) => AsyncGenerator<Uint8Array>): ReadableStream<Uint8Array> {
    const abort = new AbortController();
    const iterator = generate(abort.signal);
    return new ReadableStream<Uint8Array>({
        async pull(controller) {
            try {
                const next = await iterator.next();
                if (next.done) controller.close();
                else controller.enqueue(next.value);
            } catch (error) { controller.error(error); }
        },
        async cancel(reason) {
            abort.abort(reason ?? new DOMException("Stream cancelled", "AbortError"));
            await iterator.return(undefined).catch(() => undefined);
        },
    }, { highWaterMark: 0 });
}

/** Pull-driven SSE framing. No EOF synthesis, payload logging, reconnects or
 * accumulated response text. The consumer owns protocol terminal validation. */
export async function* readSseEvents(stream: ReadableStream<Uint8Array>, options: {
    signal?: AbortSignal;
    maxEventChars?: number;
    onChunk?: (receivedAt: number) => void;
} = {}): AsyncGenerator<EventSourceMessage> {
    const maxEventChars = options.maxEventChars ?? MAX_EVENT_CHARS;
    if (!Number.isSafeInteger(maxEventChars) || maxEventChars <= 0 || maxEventChars > MAX_EVENT_CHARS) {
        throw new RangeError("Invalid SSE event limit");
    }
    const reader = stream.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const events: EventSourceMessage[] = [];
    let completed = false;
    let endedWithCr = false;
    const cancel = () => { void reader.cancel(options.signal?.reason).catch(() => undefined); };
    options.signal?.addEventListener("abort", cancel, { once: true });
    const parser = createParser({
        maxBufferSize: maxEventChars,
        onEvent(event) {
            if (event.data.length + (event.event?.length ?? 0) + (event.id?.length ?? 0) > maxEventChars
                || events.length >= 1024) throw new SseProtocolError("sse_frame_too_large");
            events.push(event);
        },
        onError(error) {
            // Unknown fields and invalid retry values are ignored by SSE. This
            // is not a reconnecting client, so retry directives have no effect.
            if (error.type === "max-buffer-size-exceeded") throw new SseProtocolError("sse_frame_too_large");
        },
    });
    try {
        if (options.signal?.aborted) { cancel(); throw options.signal.reason; }
        while (true) {
            const { value, done } = await reader.read();
            if (options.signal?.aborted) throw options.signal.reason;
            if (done) break;
            options.onChunk?.(performance.now());
            if (value.byteLength > MAX_CHUNK_BYTES) throw new SseProtocolError("sse_chunk_too_large");
            // Bound a feed, including when one network chunk contains thousands
            // of complete messages (which bypass the parser's partial buffer).
            for (let offset = 0; offset < value.length; offset += FEED_BYTES) {
                let text: string;
                try { text = decoder.decode(value.subarray(offset, offset + FEED_BYTES), { stream: true }); }
                catch { throw new SseProtocolError("sse_invalid_utf8"); }
                if (text.length) endedWithCr = text.endsWith("\r");
                parser.feed(text);
                for (const event of events) yield event;
                events.length = 0;
            }
        }
        let tail: string;
        try { tail = decoder.decode(); } catch { throw new SseProtocolError("sse_invalid_utf8"); }
        if (tail) { endedWithCr = tail.endsWith("\r"); parser.feed(tail); }
        // A trailing CR already represents a line ending. Resolve the parser's
        // CRLF lookahead, but never append a delimiter to an incomplete frame.
        if (endedWithCr) parser.feed("\n");
        for (const event of events) yield event;
        completed = true;
    } finally {
        options.signal?.removeEventListener("abort", cancel);
        parser.reset(); events.length = 0;
        if (!completed) await reader.cancel("sse_consumer_finished").catch(() => undefined);
        reader.releaseLock();
    }
}
