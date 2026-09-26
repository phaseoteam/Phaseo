import { describe, expect, it, vi } from "vitest";
import { createPricedStreamSession } from "./streaming";

const usage = { input_tokens: 10, output_tokens: 3, total_tokens: 13 };
const cases = [
    { protocol: "openai.chat.completions", first: { object: "chat.completion.chunk", choices: [{ delta: { content: "first" } }] },
        rest: [{ object: "chat.completion.chunk", choices: [{ delta: { content: "later" }, finish_reason: "stop" }] },
            { object: "chat.completion.chunk", choices: [], usage }, "[DONE]"] },
    { protocol: "openai.responses", first: { type: "response.output_text.delta", delta: "first" },
        rest: [{ type: "response.output_text.delta", delta: "later" },
            { type: "response.completed", response: { object: "response", status: "completed", usage, output: [] } }] },
    { protocol: "anthropic.messages", first: { type: "message_start", message: { role: "assistant", content: [], usage: { input_tokens: 10, output_tokens: 0 } } },
        rest: [{ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "later" } },
            { type: "message_delta", delta: { stop_reason: "end_turn" }, usage }, { type: "message_stop" }] },
] as const;
const encode = (frame: unknown) => {
    const event = frame && typeof frame === "object" && "type" in frame ? `event: ${frame.type}\n` : "";
    return new TextEncoder().encode(`${event}data: ${frame === "[DONE]" ? frame : JSON.stringify(frame)}\n\n`);
};

describe("accounting-only stream drain", () => {
    it.each(cases)("does not serialize undeliverable $protocol output but retains all observers", async fixture => {
        let controller!: ReadableStreamDefaultController<Uint8Array>;
        const cancel = vi.fn(), serialize = vi.fn((frame: unknown) => frame), events = vi.fn(), snapshots = vi.fn(), final = vi.fn();
        const upstream = new Response(new ReadableStream<Uint8Array>({ start(value) { controller = value; value.enqueue(encode(fixture.first)); }, cancel }));
        const rewrite = vi.fn(frame => ({ toJSON: () => serialize(frame) }));
        const ctx: any = { protocol: fixture.protocol, endpoint: "responses", requestId: "fixture", workspaceId: "workspace", meta: {},
            providers: [{ providerId: "openai", streamCancellationSupport: "supported", streamCancellationStopsProviderBilling: true,
                streamCancellationUsageRecovery: "authoritative" }] };
        const { response, session } = await createPricedStreamSession({ upstream, ctx, provider: "openai", priceCard: null,
            rewriteFrame: rewrite, onStreamEvent: events, onFinalSnapshot: snapshots, onFinalUsage: final });
        const reader = response.body!.getReader();
        await reader.read(); await reader.cancel();
        expect(cancel).not.toHaveBeenCalled();
        const before = serialize.mock.calls.length;
        const observedBefore = events.mock.calls.length;
        // A serializer that would fail must never run once delivery is impossible.
        serialize.mockImplementation(() => { throw new Error("undeliverable_serialization"); });
        for (const frame of fixture.rest) controller.enqueue(encode(frame));
        controller.close();
        const outcome = await session.completion;
        await vi.waitFor(() => expect(final).toHaveBeenCalledOnce());
        expect(before).toBe(1);
        expect(serialize).toHaveBeenCalledTimes(before);
        expect(rewrite.mock.calls.length).toBeGreaterThan(before);
        expect(events.mock.calls.length).toBeGreaterThan(observedBefore);
        expect(snapshots).toHaveBeenCalledOnce();
        expect(outcome.state).toBe("CANCELLED");
        expect(outcome.finalInfo).toEqual({ aborted: false, sawFinalUsage: true });
        expect(outcome.usage).toMatchObject({ output_tokens: 3 });
        expect(outcome.deliveredFrames).toBe(1);
        expect(ctx.meta.streamDisconnectAction).toBe("drain_upstream");
        // The parser can release/cancel at the authoritative wire terminal, but
        // client cancellation itself must not interrupt usage acquisition.
        expect(upstream.body!.locked).toBe(false);
    });

    it("does not promote partial usage to successful settlement when the drain fails", async () => {
        let controller!: ReadableStreamDefaultController<Uint8Array>;
        const serialize = vi.fn((frame: unknown) => frame), final = vi.fn();
        const upstream = new Response(new ReadableStream<Uint8Array>({ start(value) { controller = value; value.enqueue(encode(cases[0].first)); } }));
        const { response, session } = await createPricedStreamSession({ upstream,
            ctx: { protocol: "openai.chat.completions", requestId: "fixture", workspaceId: "workspace", meta: {} } as any,
            provider: "poolside", priceCard: null, rewriteFrame: frame => ({ toJSON: () => serialize(frame) }), onFinalUsage: final });
        const reader = response.body!.getReader(); await reader.read(); await reader.cancel();
        controller.enqueue(encode({ object: "chat.completion.chunk", choices: [], usage }));
        controller.close(); // No DONE: usage is not a successful terminal receipt.
        const outcome = await session.completion;
        await vi.waitFor(() => expect(final).toHaveBeenCalledOnce());
        expect(serialize).toHaveBeenCalledOnce();
        expect(outcome.state).toBe("FAILED");
        expect(outcome.finalInfo).toEqual({ aborted: true, sawFinalUsage: false, failureOrigin: "provider" });
        expect(outcome.downstreamDisconnected).toBe(true);
        expect(upstream.body!.locked).toBe(false);
    });
});
