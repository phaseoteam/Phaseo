import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
    background: [] as Promise<unknown>[],
    getJson: vi.fn(),
    putJson: vi.fn(),
}));

vi.mock("@/core/kv", () => ({
    getJson: (...args: unknown[]) => runtime.getJson(...args),
    putJson: (...args: unknown[]) => runtime.putJson(...args),
}));

vi.mock("@/runtime/env", () => ({
    dispatchBackground: (promise: Promise<unknown>) => runtime.background.push(promise),
}));

const sticky = await import("./sticky-routing");

describe("optimistic sticky routing", () => {
    beforeEach(() => {
        runtime.background.length = 0;
        runtime.getJson.mockReset();
        runtime.putJson.mockReset();
        sticky.resetStickyRoutingStateForTests();
    });

    it("returns immediately on a cold read and warms the isolate in the background", async () => {
        const stored = {
            providerId: "openai",
            cachedReadTokens: 1_024,
            contextKey: "context:abc",
            source: "context_hash" as const,
            createdAt: new Date().toISOString(),
        };
        runtime.getJson.mockImplementation(async () => {
            await new Promise((resolve) => setTimeout(resolve, 20));
            return stored;
        });

        const started = performance.now();
        const cold = sticky.readStickyRoutingOptimistic(
            "workspace",
            "responses",
            "openai/gpt-5-nano",
            "context:abc",
        );

        expect(cold).toBeNull();
        expect(performance.now() - started).toBeLessThan(5);
        await Promise.allSettled(runtime.background.splice(0));
        expect(
            sticky.readStickyRoutingOptimistic(
                "workspace",
                "responses",
                "openai/gpt-5-nano",
                "context:abc",
            ),
        ).toEqual(stored);
        expect(runtime.getJson).toHaveBeenCalledTimes(1);
    });

    it("uses session affinity ahead of context affinity by default", async () => {
        const context = await sticky.resolveStickyRoutingContext({
            endpoint: "responses",
            body: {
                session_id: "support-session-42",
                input: "Hello",
            },
        });

        expect(context).toMatchObject({
            source: "session_id",
        });
        expect(context?.key).toMatch(/^session:/);
    });

    it("allows session affinity and cache-aware routing to be disabled per request", async () => {
        expect(sticky.resolveCacheAwareRoutingPreference({
            provider: { cache_aware_routing: false },
        })).toBe(false);
        expect(sticky.resolveSessionAffinityPreference({
            routing: { session_affinity: false },
        })).toBe(false);

        const context = await sticky.resolveStickyRoutingContext({
            endpoint: "responses",
            body: {
                session_id: "support-session-42",
                routing: { session_affinity: false },
                input: "Hello",
            },
        });
        expect(context?.source).toBe("context_hash");
    });

    it("keeps context affinity for 15 minutes and session affinity for an active day", async () => {
        runtime.putJson.mockResolvedValue(undefined);

        await sticky.writeStickyRouting(
            "workspace",
            "responses",
            "openai/gpt-5",
            { key: "context:abc", source: "context_hash" },
            "openai",
            1_024,
        );
        await sticky.writeStickyRouting(
            "workspace",
            "responses",
            "openai/gpt-5",
            { key: "session:def", source: "session_id" },
            "anthropic",
            2_048,
        );

        expect(runtime.putJson.mock.calls[0]?.[2]).toBe(15 * 60);
        expect(runtime.putJson.mock.calls[1]?.[2]).toBe(24 * 60 * 60);
    });

    it("creates affinity from either a cache write or a cache read", () => {
        expect(sticky.extractCacheAffinityTokens({ cached_write_text_tokens: 512 })).toBe(512);
        expect(sticky.extractCacheAffinityTokens({
            cached_write_text_tokens_5m: 300,
            cached_write_text_tokens_1h: 200,
        })).toBe(500);
        expect(sticky.extractCacheAffinityTokens({
            input_tokens_details: { cached_tokens: 1_024 },
        })).toBe(1_024);
    });

    it.each(["chat.completions", "messages", "responses"] as const)(
        "ignores later conversation content once %s opening anchors are found",
        async (endpoint) => {
            const opening = [
                { role: "system", content: "System instructions" },
                { role: "user", content: "Opening question" },
            ];
            const expected = await sticky.resolveStickyRoutingContext({
                endpoint,
                body: endpoint === "responses" ? { input: opening } : { messages: opening },
            });
            const laterContent = vi.fn(() => "Later answer");
            const history = [...opening, { role: "assistant", get content() { return laterContent(); } }];
            const actual = await sticky.resolveStickyRoutingContext({
                endpoint,
                body: endpoint === "responses" ? { input: history } : { messages: history },
            });
            expect(actual).toEqual(expected);
            expect(laterContent).not.toHaveBeenCalled();
        },
    );

    it("uses the first eight meaningful content parts without visiting the rest", async () => {
        const parts = [null, "", ...Array.from({ length: 8 }, (_, i) => ({ type: "text", text: `Part ${i}` }))];
        const expected = await sticky.resolveStickyRoutingContext({
            endpoint: "messages",
            body: { messages: [{ role: "user", content: parts }] },
        });
        const laterText = vi.fn(() => "Ignored");
        const actual = await sticky.resolveStickyRoutingContext({
            endpoint: "messages",
            body: { messages: [{ role: "user", content: [...parts, { type: "text", get text() { return laterText(); } }] }] },
        });
        expect(actual).toEqual(expected);
        expect(laterText).not.toHaveBeenCalled();
    });

    it("continues looking for a later system anchor and preserves assistant fallback", async () => {
        const context = await sticky.resolveStickyRoutingContext({
            endpoint: "chat.completions",
            body: { messages: [
                { role: "assistant", content: "Fallback opening" },
                { role: "system", content: "Late instructions" },
            ] },
        });
        const equivalent = await sticky.resolveStickyRoutingContext({
            endpoint: "chat.completions",
            body: { messages: [
                { role: "system", content: "Late instructions" },
                { role: "user", content: "Fallback opening" },
            ] },
        });
        expect(context).toEqual(equivalent);
    });
});
