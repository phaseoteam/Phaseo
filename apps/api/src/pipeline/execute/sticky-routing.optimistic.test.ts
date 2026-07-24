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
});
