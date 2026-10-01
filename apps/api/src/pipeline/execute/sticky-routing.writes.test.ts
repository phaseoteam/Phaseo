import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), tasks: [] as Promise<unknown>[] }));
vi.mock("@/core/kv", () => ({ getJson: mocks.get, putJson: mocks.put }));
vi.mock("@/runtime/env", () => ({ dispatchBackground: (task: Promise<unknown>) => mocks.tasks.push(task) }));
import { maybeWriteStickyRoutingFromUsage, readStickyRoutingOptimistic, resetStickyRoutingStateForTests, writeStickyRouting } from "./sticky-routing";

const context = { key: "context:one", source: "context_hash" as const };
const write = (provider = "a", tokens = 100) => writeStickyRouting("workspace", "responses", "model", context, provider, tokens);
const read = () => readStickyRoutingOptimistic("workspace", "responses", "model", context.key);
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T12:00:00Z"));
    mocks.get.mockReset().mockResolvedValue(null);
    mocks.put.mockReset().mockResolvedValue(undefined);
    mocks.tasks = [];
    resetStickyRoutingStateForTests();
});
afterEach(() => vi.useRealTimers());

describe("bounded routing-hint writes", () => {
    it("reduces 100 same-key completions to one write without extra reads", async () => {
        for (let i = 0; i < 100; i++) {
            await write("a", 100 + i);
            vi.advanceTimersByTime(100);
        }
        expect(mocks.put).toHaveBeenCalledTimes(1);
        expect(mocks.get).not.toHaveBeenCalled();
        expect(read()).toMatchObject({ providerId: "a", cachedReadTokens: 199 });
    });

    it("refreshes at 60 seconds from the write, not from suppressed activity", async () => {
        await write();
        vi.advanceTimersByTime(59_999);
        await write();
        expect(mocks.put).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(1);
        await write();
        expect(mocks.put).toHaveBeenCalledTimes(2);
        expect(mocks.put.mock.calls[1][2]).toBe(900);
    });

    it.each(["unique keys", "sparse activity"])("does not assume savings for %s", async scenario => {
        for (let i = 0; i < 100; i++) {
            await writeStickyRouting("workspace", "responses", "model",
                { ...context, key: scenario === "unique keys" ? `context:${i}` : context.key }, "a", 100);
            if (scenario === "sparse activity") vi.advanceTimersByTime(60_000);
        }
        expect(mocks.put).toHaveBeenCalledTimes(100);
        expect(mocks.get).not.toHaveBeenCalled();
    });

    it("requires an acknowledged local write even when a KV read warmed the hint", async () => {
        mocks.get.mockResolvedValueOnce({ providerId: "a", cachedReadTokens: 100, ...context, contextKey: context.key, createdAt: new Date().toISOString() });
        expect(read()).toBeNull(); await Promise.all(mocks.tasks);
        await write();
        expect(mocks.put).toHaveBeenCalledTimes(1);
    });

    it("writes provider changes immediately, including a return to the old provider", async () => {
        await write("a"); await write("b"); await write("a");
        expect(mocks.put.mock.calls.map(call => call[1].providerId)).toEqual(["a", "b", "a"]);
    });

    it("does not suppress a change in whether a hint may influence routing", async () => {
        await write("a", 100); await write("a", 0); await write("a", 200);
        expect(mocks.put).toHaveBeenCalledTimes(3);
    });

    it("coalesces concurrent identical writes and keeps local reads immediate", async () => {
        const gate = deferred<void>();
        mocks.put.mockReturnValueOnce(gate.promise);
        const writes = Array.from({ length: 100 }, (_, i) => write("a", i + 1));
        expect(read()?.cachedReadTokens).toBe(100);
        await vi.waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
        gate.resolve(); await Promise.all(writes);
        expect(mocks.put).toHaveBeenCalledTimes(1);
    });

    it("orders provider changes behind an in-flight write without delaying local hints", async () => {
        const gate = deferred<void>();
        mocks.put.mockReturnValueOnce(gate.promise);
        const a = write("a");
        await vi.waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
        const b = write("b");
        expect(read()?.providerId).toBe("b");
        gate.resolve(); await Promise.all([a, b]);
        expect(mocks.put.mock.calls.map(call => call[1].providerId)).toEqual(["a", "b"]);
    });

    it("does not treat failed or ambiguous writes as persisted", async () => {
        await write("a");
        mocks.put.mockRejectedValueOnce(new Error("ambiguous write"));
        await expect(write("b")).rejects.toThrow("ambiguous write");
        await write("a");
        expect(mocks.put).toHaveBeenCalledTimes(3);
    });

    it("lets a queued completion retry after the first write fails", async () => {
        const gate = deferred<void>();
        mocks.put.mockReturnValueOnce(gate.promise);
        const first = expect(write()).rejects.toThrow("unavailable");
        const second = write();
        gate.reject(new Error("unavailable"));
        await Promise.all([first, second]);
        expect(mocks.put).toHaveBeenCalledTimes(2);
    });

    it.each([null, { providerId: "old", cachedReadTokens: 1, source: "context_hash", contextKey: context.key, createdAt: "old" }])(
        "does not let a slow KV refresh replace a newer local hint (%j)", async old => {
            const gate = deferred<typeof old>();
            mocks.get.mockReturnValueOnce(gate.promise);
            expect(read()).toBeNull();
            await write("new");
            gate.resolve(old); await Promise.all(mocks.tasks);
            expect(read()?.providerId).toBe("new");
        },
    );

    it("does not coalesce across workspaces, models, endpoints or contexts", async () => {
        await write();
        await writeStickyRouting("other", "responses", "model", context, "a", 100);
        await writeStickyRouting("workspace", "responses", "other", context, "a", 100);
        await writeStickyRouting("workspace", "messages", "model", context, "a", 100);
        await writeStickyRouting("workspace", "responses", "model", { ...context, key: "context:two" }, "a", 100);
        expect(mocks.put).toHaveBeenCalledTimes(5);
    });

    it("keeps session TTL and source changes distinct", async () => {
        await write();
        await writeStickyRouting("workspace", "responses", "model", { ...context, source: "session_id" }, "a", 100);
        expect(mocks.put.mock.calls[1][2]).toBe(86_400);
    });

    it("bounds remembered writes and safely rewrites evicted entries", async () => {
        await write();
        for (let i = 0; i < 1000; i++) {
            await writeStickyRouting("workspace", "responses", "model", { ...context, key: `context:${i}` }, "a", 100);
        }
        await write();
        expect(mocks.put).toHaveBeenCalledTimes(1002);
    });

    it("does not turn clock rollback into a long suppression window", async () => {
        await write(); vi.setSystemTime(Date.now() - 1_000); await write();
        expect(mocks.put).toHaveBeenCalledTimes(2);
    });

    it("preserves opt-out and the requirement for provider cache evidence", async () => {
        const args = { workspaceId: "workspace", endpoint: "responses" as const, model: "model", body: { session_id: "s" }, providerId: "a", usage: { cached_read_text_tokens: 100 } };
        await maybeWriteStickyRoutingFromUsage({ ...args, enabled: false });
        await maybeWriteStickyRoutingFromUsage({ ...args, usage: { input_tokens: 100 } });
        expect(mocks.put).not.toHaveBeenCalled();
        await maybeWriteStickyRoutingFromUsage(args);
        await maybeWriteStickyRoutingFromUsage(args);
        expect(mocks.put).toHaveBeenCalledTimes(1);
    });
});
