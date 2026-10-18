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

    it("rewrites an unchanged pin only after a third of its TTL", async () => {
        vi.useFakeTimers({ now: Date.parse("2026-10-09T00:00:00Z") });
        try {
            runtime.putJson.mockResolvedValue(undefined);
            const write = (providerId: string) => sticky.writeStickyRouting(
                "workspace", "responses", "openai/gpt-5", { key: "context:same", source: "context_hash" }, providerId, 1_024,
            );

            await write("openai");
            await write("openai");
            expect(runtime.putJson).toHaveBeenCalledTimes(1);

            await write("anthropic");
            expect(runtime.putJson).toHaveBeenCalledTimes(2);

            vi.setSystemTime(Date.now() + 5 * 60_000);
            await write("anthropic");
            expect(runtime.putJson).toHaveBeenCalledTimes(3);
        } finally {
            vi.useRealTimers();
        }
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
            // A mid-conversation turn: neither the context hash nor the cache-mark scan
            // (opening and latest turns only) should read it.
            const turn = (index: number) => ({ role: index % 2 ? "user" : "assistant", content: `Turn ${index}` });
            const history = [
                ...opening,
                ...Array.from({ length: 6 }, (_, index) => turn(index)),
                { role: "assistant", get content() { return laterContent(); } },
                ...Array.from({ length: 4 }, (_, index) => turn(index + 7)),
            ];
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

    it("caches a missing pin for seconds and a found pin for at most a minute", async () => {
        vi.useFakeTimers({ now: Date.parse("2026-10-17T10:00:00Z") });
        try {
            const stored = {
                providerId: "anthropic",
                cachedReadTokens: 0,
                contextKey: "context:fresh",
                source: "context_hash" as const,
                createdAt: new Date().toISOString(),
            };
            runtime.getJson.mockResolvedValueOnce(null);
            const read = () => sticky.readStickyRoutingOptimistic("workspace", "messages", "anthropic/claude-sonnet-5", "context:fresh");

            expect(read()).toBeNull();
            await Promise.allSettled(runtime.background.splice(0));
            // Another isolate writes the pin. The negative entry expires within seconds.
            runtime.getJson.mockResolvedValue(stored);
            expect(read()).toBeNull();
            expect(runtime.background).toHaveLength(0);
            vi.setSystemTime(Date.now() + 6_000);
            expect(read()).toBeNull();
            await Promise.allSettled(runtime.background.splice(0));
            expect(read()).toEqual(stored);

            // A positive entry is re-read from KV after a minute, even though the pin lasts longer.
            runtime.getJson.mockResolvedValue({ ...stored, providerId: "anthropic-us" });
            vi.setSystemTime(Date.now() + 59_000);
            expect(read()?.providerId).toBe("anthropic");
            vi.setSystemTime(Date.now() + 2_000);
            expect(read()).toBeNull();
            await Promise.allSettled(runtime.background.splice(0));
            expect(read()?.providerId).toBe("anthropic-us");
        } finally {
            vi.useRealTimers();
        }
    });

    it("waits for KV on a cold isolate when the request carries an affinity key", async () => {
        const stored = {
            providerId: "openai-eu",
            cachedReadTokens: 0,
            contextKey: "prompt:abc",
            source: "prompt_cache_key" as const,
            createdAt: new Date().toISOString(),
        };
        runtime.getJson.mockResolvedValue(stored);
        const keyed = await sticky.readStickyRoutingForRouting("workspace", "responses", "openai/gpt-5.6", {
            key: "prompt:abc",
            source: "prompt_cache_key",
            explicit: true,
        });
        expect(keyed).toEqual({ entry: stored, mode: "kv" });
        expect(runtime.background).toHaveLength(0);

        const implicit = await sticky.readStickyRoutingForRouting("workspace", "responses", "openai/gpt-5.6", {
            key: "context:other",
            source: "context_hash",
        });
        expect(implicit).toEqual({ entry: null, mode: "optimistic" });
        expect(runtime.background).toHaveLength(1);
    });

    it("marks prompt_cache_key, session_id and cache_control requests as explicit affinity", async () => {
        const base = { messages: [{ role: "user", content: "hi" }] };
        const explicitFor = async (endpoint: "chat.completions" | "messages", body: any) =>
            (await sticky.resolveStickyRoutingContext({ endpoint, body }))?.explicit;
        expect(await explicitFor("chat.completions", { ...base, prompt_cache_key: "k" })).toBe(true);
        expect(await explicitFor("chat.completions", { ...base, session_id: "s" })).toBe(true);
        expect(await explicitFor("messages", { ...base, cache_control: { type: "ephemeral" } })).toBe(true);
        expect(await explicitFor("chat.completions", {
            ...base,
            provider_options: { anthropic: { cache_control: { type: "ephemeral", ttl: "1h" } } },
        })).toBe(true);
        expect(await explicitFor("chat.completions", base)).toBe(false);
    });

    it("treats block-level cache marks on content and tools as explicit affinity", async () => {
        const explicitFor = async (endpoint: "chat.completions" | "messages" | "responses", body: any) =>
            (await sticky.resolveStickyRoutingContext({ endpoint, body }))?.explicit;
        const mark = { type: "ephemeral" };
        expect(await explicitFor("messages", {
            system: [{ type: "text", text: "Policy", cache_control: mark }],
            messages: [{ role: "user", content: "hi" }],
        })).toBe(true);
        expect(await explicitFor("chat.completions", {
            messages: [{ role: "user", content: [{ type: "text", text: "Doc", cache_control: mark }] }],
        })).toBe(true);
        expect(await explicitFor("chat.completions", {
            tools: [{ type: "function", function: { name: "f", parameters: {} }, cache_control: mark }],
            messages: [{ role: "user", content: "hi" }],
        })).toBe(true);
        expect(await explicitFor("responses", {
            input: [{ role: "user", content: [{ type: "input_text", text: "Doc", prompt_cache_breakpoint: { mode: "explicit" } }] }],
        })).toBe(true);
        expect(await explicitFor("messages", {
            messages: [{ role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: [{ type: "text", text: "out", cache_control: mark }] }] }],
        })).toBe(true);

        // The longest valid block TTL sets the provider retention.
        expect(sticky.resolveProviderCacheRetentionSeconds({
            providerId: "anthropic",
            body: { messages: [
                { role: "user", content: [{ type: "text", text: "a", cache_control: { type: "ephemeral", ttl: "1h" } }] },
                { role: "user", content: [{ type: "text", text: "b", cache_control: mark }] },
            ] },
        })).toBe(60 * 60);
        expect(sticky.resolveProviderCacheRetentionSeconds({
            providerId: "anthropic",
            body: { messages: [{ role: "user", content: [{ type: "text", text: "a", cache_control: { type: "ephemeral", ttl: "24h" } }] }] },
        })).toBe(5 * 60);
    });

    it("pins on the first successful step without a reported cache read or write", async () => {
        runtime.putJson.mockResolvedValue(undefined);
        await sticky.maybeWriteStickyRoutingFromUsage({
            workspaceId: "workspace",
            endpoint: "chat.completions",
            model: "anthropic/claude-sonnet-5",
            body: { messages: [{ role: "user", content: "hi" }], prompt_cache_key: "turn-1" },
            providerId: "anthropic-aws-us",
            providerModelSlug: "claude-sonnet-5",
            apiModelId: "anthropic/claude-sonnet-5",
            keySource: "byok",
            byokKeyId: "key_1",
            usage: { prompt_tokens: 9_000, completion_tokens: 200 },
        });
        expect(runtime.putJson).toHaveBeenCalledTimes(1);
        expect(runtime.putJson.mock.calls[0]?.[1]).toMatchObject({
            providerId: "anthropic-aws-us",
            providerModelSlug: "claude-sonnet-5",
            apiModelId: "anthropic/claude-sonnet-5",
            keySource: "byok",
            byokKeyId: "key_1",
            cachedReadTokens: 0,
            source: "prompt_cache_key",
        });

        // Without an affinity request, a step that reports no cache use does not pin.
        await sticky.maybeWriteStickyRoutingFromUsage({
            workspaceId: "workspace",
            endpoint: "chat.completions",
            model: "anthropic/claude-sonnet-5",
            body: { messages: [{ role: "user", content: "other" }] },
            providerId: "anthropic",
            usage: { prompt_tokens: 9_000, completion_tokens: 200 },
        });
        expect(runtime.putJson).toHaveBeenCalledTimes(1);
    });

    it.each([
        ["Anthropic 5m default", "anthropic", { cache_control: { type: "ephemeral" } }, undefined, 15 * 60],
        ["Anthropic 1h", "anthropic", { provider_options: { anthropic: { cache_control: { type: "ephemeral", ttl: "1h" } } } }, undefined, 90 * 60],
        ["Anthropic 1h write reported", "amazon-bedrock", { cache_control: { type: "ephemeral" } }, { cache_creation: { ephemeral_1h_input_tokens: 4_000 } }, 90 * 60],
        ["OpenAI default (in-memory)", "openai", { prompt_cache_key: "k" }, undefined, 90 * 60],
        ["OpenAI 24h", "openai-eu", { prompt_cache_key: "k", prompt_cache_retention: "24h" }, undefined, 24 * 60 * 60],
        ["OpenAI top-level wins over provider_options", "openai", { prompt_cache_key: "k", prompt_cache_retention: "in_memory", provider_options: { openai: { prompt_cache_retention: "24h" } } }, undefined, 90 * 60],
        ["OpenAI provider_options alias", "azure", { prompt_cache_key: "k", provider_options: { openai: { prompt_cache_retention: "24h" } } }, undefined, 24 * 60 * 60],
        ["GPT-5.6 prompt_cache_options 30m", "openai", { prompt_cache_key: "k", prompt_cache_options: { ttl: "30m" } }, undefined, 45 * 60],
        ["OpenAI retention ignored on other providers", "cerebras", { prompt_cache_key: "k", prompt_cache_retention: "24h" }, undefined, 15 * 60],
        ["session_id", "fireworks", { session_id: "s" }, undefined, 24 * 60 * 60],
    ])("derives the pin TTL from cache retention: %s", async (_label, providerId, extra, usage, expected) => {
        runtime.putJson.mockResolvedValue(undefined);
        await sticky.maybeWriteStickyRoutingFromUsage({
            workspaceId: "workspace",
            endpoint: "chat.completions",
            model: "model",
            body: { messages: [{ role: "user", content: "hi" }], ...extra },
            providerId,
            usage: usage ?? {},
        });
        expect(runtime.putJson.mock.calls[0]?.[2]).toBe(expected);
    });
});
