import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const jobs = vi.hoisted(() => ({ batch: vi.fn(), video: vi.fn(), realtime: vi.fn(), webhooks: vi.fn() }));
vi.mock("@/pipeline/batch-reconciliation", () => ({ runBatchReconciliationJob: jobs.batch }));
vi.mock("@/pipeline/video-reconciliation", () => ({ runVideoReconciliationJob: jobs.video }));
vi.mock("../realtime-sessions", () => ({ runRealtimeSessionReconciliationJob: jobs.realtime }));
vi.mock("../async-notifications", () => ({ runAsyncWebhookRetriesJob: jobs.webhooks }));
vi.mock("./client", () => ({ publishedWorkspace: () => "workspace" }));
vi.mock("@/runtime/env", () => ({ getBindings: () => ({ GATEWAY_PUBLIC_BASE_URL: "https://api-staging.phaseo.app", REALTIME_RELAY: "relay-fixture" }) }));
import { recoverPublishedWorkspace } from "./recovery";
describe("workspace lifecycle recovery", () => {
    beforeEach(() => vi.resetAllMocks());
    afterEach(() => vi.restoreAllMocks());
    it("reuses bounded recovery jobs without invoking the global scheduler", async () => {
        expect(await recoverPublishedWorkspace("workspace")).toEqual({ ok: true });
        expect(jobs.batch).toHaveBeenCalledWith({ limit: 10, concurrency: 2 });
        expect(jobs.video).toHaveBeenCalledWith({ limit: 10, concurrency: 2 });
        expect(jobs.realtime).toHaveBeenCalledWith({ limit: 10, relay: "relay-fixture" });
        expect(jobs.webhooks).toHaveBeenCalledWith({ limitPerKind: 10, maxPagesPerKind: 1, maxDeliveries: 10, baseUrl: "https://api-staging.phaseo.app" });
    });
    it("attempts the other lifecycles even when one fails and reports the failure", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        jobs.batch.mockRejectedValue(new Error("unavailable"));
        await expect(recoverPublishedWorkspace("workspace")).rejects.toThrow("request_state_recovery_incomplete");
        expect(jobs.video).toHaveBeenCalledOnce();
        expect(jobs.realtime).toHaveBeenCalledOnce();
        expect(jobs.webhooks).toHaveBeenCalledOnce();
    });
    it("rejects another workspace before any recovery runs", async () => {
        await expect(recoverPublishedWorkspace("another")).rejects.toThrow("workspace_not_published");
        for (const job of Object.values(jobs)) expect(job).not.toHaveBeenCalled();
    });
});
