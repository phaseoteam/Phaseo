import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ end: vi.fn(), probe: vi.fn(), breaker: vi.fn(), release: vi.fn(), acquire: vi.fn(), tasks: [] as Promise<unknown>[] }));
vi.mock("@/runtime/env", () => ({
    ensureRuntimeForBackground: state.acquire,
    dispatchBackground: (task: Promise<unknown>) => state.tasks.push(task),
}));
vi.mock("./health", async importOriginal => ({
    ...await importOriginal<typeof import("./health")>(),
    onCallEnd: state.end, reportProbeResult: state.probe, maybeOpenOnRecentErrors: state.breaker,
}));
import { reportBufferedStreamHealth } from "./buffered-health";

function fixture() {
    return { ctx: { endpoint: "responses" } as any,
        result: { upstream: new Response(null, { status: 200 }), keySource: "gateway",
            healthContext: { observationId: "attempt-1", startedAt: 123, isProbe: false, provider: "private:workspace-a:route-a", model: "lab/model" } } as any,
        response: { choices: [{ finishReason: "stop" }], usage: { inputTokens: 70, outputTokens: 10 } } as any,
        latencyMs: 120, generationMs: 250 };
}
beforeEach(() => {
    vi.clearAllMocks(); state.tasks = [];
    state.acquire.mockReset().mockReturnValue(state.release);
    state.end.mockResolvedValue({ rateLimited: false });
});
describe("buffered stream health completion", () => {
    it("allows another reporter to retry when acquiring the background runtime fails", async () => {
        const args = fixture();
        state.acquire.mockImplementationOnce(() => { throw new Error("runtime unavailable"); });
        reportBufferedStreamHealth(args);
        expect(args.result.healthContext.completed).not.toBe(true);
        reportBufferedStreamHealth(args);
        await Promise.all(state.tasks);
        expect(state.end).toHaveBeenCalledOnce();
        expect(args.result.healthContext.completed).toBe(true);
    });
    it("reports one scoped success with per-attempt timing and usage, without waiting for delivery", async () => {
        const args = fixture();
        let complete!: (value: unknown) => void;
        state.end.mockReturnValue(new Promise(resolve => { complete = resolve; }));
        reportBufferedStreamHealth(args);
        reportBufferedStreamHealth(args);
        expect(state.end).toHaveBeenCalledOnce();
        expect(state.end).toHaveBeenCalledWith("responses", expect.objectContaining({ observationId: "attempt-1", startedAt: 123,
            provider: "private:workspace-a:route-a", model: "lab/model", ok: true, healthImpact: "success",
            latency_ms: 120, generation_ms: 250, tokens_in: 70, tokens_out: 10 }));
        expect(args.result.healthContext.completed).toBe(true);
        expect(state.release).not.toHaveBeenCalled();
        complete({ rateLimited: false }); await Promise.all(state.tasks);
        expect(state.release).toHaveBeenCalledOnce();
    });
    it.each(["error", "stream"])("reports explicit provider failure (%s)", async kind => {
        const args = fixture();
        if (kind === "error") args.response.choices[0].finishReason = "error";
        reportBufferedStreamHealth({ ...args, streamFailed: kind === "stream" });
        await Promise.all(state.tasks);
        expect(state.end).toHaveBeenCalledWith("responses", expect.objectContaining({ ok: false, healthImpact: "failure" }));
        expect(state.breaker).toHaveBeenCalledOnce();
    });
    it.each([{ aborted: true }, { materializationFailed: true }])("does not penalize cancellation or unknown gateway failures (%j)", flags => {
        reportBufferedStreamHealth({ ...fixture(), ...flags });
        expect(state.end).not.toHaveBeenCalled(); expect(state.tasks).toHaveLength(0);
    });
    it("closes probe handling once and releases runtime after failed delivery", async () => {
        const args = fixture(); args.result.healthContext.isProbe = true;
        reportBufferedStreamHealth(args); await Promise.all(state.tasks);
        expect(state.probe).toHaveBeenCalledWith("responses", "private:workspace-a:route-a", "lab/model", true);
        state.tasks = []; state.end.mockRejectedValue(new Error("unavailable"));
        reportBufferedStreamHealth(fixture()); await Promise.allSettled(state.tasks);
        expect(state.release).toHaveBeenCalledTimes(2);
    });
});
