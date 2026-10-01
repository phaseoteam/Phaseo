import { SseProtocolError } from "./sse";

/** Sniff only the bounded prefix; do not buffer a streamed response to detect
 * providers that ignore stream=true and return JSON (sometimes as text/plain). */
export async function sniffUpstreamBody(source: ReadableStream<Uint8Array>, onChunk?: () => void) {
    const reader = source.getReader(), prefix: Uint8Array[] = [];
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let seen = 0, first = "", released = false;
    const release = () => { if (!released) { released = true; reader.releaseLock(); } };
    try {
        while (!first) {
            const next = await reader.read();
            if (next.done) { release(); break; }
            if (!next.value.length) continue;
            onChunk?.();
            if (next.value.length > 16 * 1024 * 1024) throw new SseProtocolError("sse_chunk_too_large");
            prefix.push(next.value);
            const inspect = next.value.subarray(0, Math.max(0, 4096 - seen));
            let text: string;
            try { text = decoder.decode(inspect, { stream: true }); } catch { throw new SseProtocolError("sse_invalid_utf8"); }
            seen += inspect.length;
            first = text.trimStart().charAt(0);
            if (!first && seen >= 4096) throw new SseProtocolError("sse_frame_too_large");
        }
    } catch (error) { await reader.cancel().catch(() => undefined); release(); throw error; }
    let offset = 0;
    const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
            if (offset < prefix.length) { const value = prefix[offset]; prefix[offset++] = new Uint8Array(); controller.enqueue(value); return; }
            if (released) { controller.close(); return; }
            try {
                const next = await reader.read();
                if (next.done) { release(); controller.close(); } else { onChunk?.(); controller.enqueue(next.value); }
            } catch (error) { release(); controller.error(error); }
        },
        async cancel(reason) { prefix.length = 0; if (!released) { try { await reader.cancel(reason); } finally { release(); } } },
    }, { highWaterMark: 0 });
    return { kind: first === "{" || first === "[" ? "json" as const : "sse" as const, stream };
}

export async function readBoundedUpstreamJson(source: ReadableStream<Uint8Array>, maximumBytes = 16 * 1024 * 1024): Promise<any> {
    const reader = source.getReader(), decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0, text = "", complete = false;
    try {
        while (true) {
            const next = await reader.read();
            if (next.done) { complete = true; break; }
            bytes += next.value.length;
            if (bytes > maximumBytes) throw new SseProtocolError("sse_state_too_large");
            try { text += decoder.decode(next.value, { stream: true }); } catch { throw new SseProtocolError("sse_invalid_utf8"); }
        }
        try { text += decoder.decode(); } catch { throw new SseProtocolError("sse_invalid_utf8"); }
        try { return JSON.parse(text); } catch { throw new SseProtocolError("sse_invalid_json"); }
    } finally { if (!complete) await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
