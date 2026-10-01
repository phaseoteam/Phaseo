import { readSseEvents, sseReadable, SseProtocolError } from "@/core/sse";
import { classifyStreamProviderError } from "@/core/stream-error";

type FinalUsage = { usage: Record<string, unknown>; stopReason: string | null };

/** Observe the consumed stream, never tee an unread accounting copy. No output
 * content is retained. This observer also provides the same-protocol fast path. */
export function observeAnthropicStream(source: ReadableStream<Uint8Array>, credentialSource?: "gateway" | "byok") {
    let final: FinalUsage | null = null;
    const encoder = new TextEncoder();
    const stream = sseReadable(async function* (signal) {
        let usage: Record<string, unknown> = {}, stopReason: string | null = null;
        const mergeUsage = (next: unknown) => {
            if (!next || typeof next !== "object" || Array.isArray(next)) return;
            const merged = { ...usage, ...next };
            if (Object.keys(merged).length > 64 || JSON.stringify(merged).length > 16_384) throw new SseProtocolError("sse_state_too_large");
            usage = merged;
        };
        for await (const event of readSseEvents(source, { signal })) {
            let payload: any;
            try { payload = JSON.parse(event.data); } catch { throw new SseProtocolError("sse_invalid_json"); }
            if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new SseProtocolError("sse_invalid_json");
            const eventName = event.event || payload.type;
            if (typeof eventName !== "string" || !/^[A-Za-z0-9_.-]{1,128}$/.test(eventName)) throw new SseProtocolError("sse_invalid_json");
            if (payload?.type === "error") throw classifyStreamProviderError(payload, credentialSource);
            mergeUsage(payload?.message?.usage);
            mergeUsage(payload?.usage);
            if (typeof payload?.delta?.stop_reason === "string") stopReason = payload.delta.stop_reason;
            if (typeof payload?.message?.stop_reason === "string") stopReason = payload.message.stop_reason;
            if ((stopReason?.length ?? 0) > 128) throw new SseProtocolError("sse_state_too_large");
            if (payload?.type === "message_stop") final = { usage, stopReason };
            // Preserve native payloads and event identity, including unknown content
            // blocks/signatures/citations. Only SSE framing is canonicalized.
            yield encoder.encode(`event: ${eventName}\n${event.id ? `id: ${event.id}\n` : ""}${event.data.split("\n").map(line => `data: ${line}`).join("\n")}\n\n`);
            if (final) return;
        }
        throw new SseProtocolError("sse_missing_terminal");
    });
    return { stream, finalUsage(): FinalUsage {
        if (!final) throw new SseProtocolError("sse_missing_terminal");
        return { usage: structuredClone(final.usage), stopReason: final.stopReason };
    } };
}

export async function collectAnthropicStreamUsage(source: ReadableStream<Uint8Array>): Promise<FinalUsage> {
    const observed = observeAnthropicStream(source);
    const reader = observed.stream.getReader();
    try { while (!(await reader.read()).done) { /* Consume once; retain usage only. */ } }
    finally { reader.releaseLock(); }
    return observed.finalUsage();
}
