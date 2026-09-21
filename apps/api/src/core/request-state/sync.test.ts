import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LedgerEvent } from "./ledger";

const mocks = vi.hoisted(() => ({ charge: vi.fn(), reserve: vi.fn(), capture: vi.fn(), release: vi.fn(), settle: vi.fn(),
    pending: vi.fn(), acknowledge: vi.fn(), status: vi.fn(), refresh: vi.fn(), readWallet: vi.fn() }));
vi.mock("@/pipeline/pricing/persist", () => ({ recordUsageAndChargeInDatabase: mocks.charge }));
vi.mock("../wallet-reservations", () => ({ reserveWalletCreditsInDatabase: mocks.reserve,
    captureWalletReservationInDatabase: mocks.capture, releaseWalletReservationInDatabase: mocks.release, settleWalletReservationInDatabase: mocks.settle }));
vi.mock("./client", () => ({ publishedWorkspace: () => "workspace", workspaceState: () => ({
    pendingEvents: mocks.pending, acknowledgeAccounting: mocks.acknowledge, syncStatus: mocks.status, refreshWallet: mocks.refresh,
}) }));
vi.mock("@/runtime/env", () => ({ getSupabaseAdmin: () => ({ from: (table: string) => {
    expect(table).toBe("wallets"); return { select: () => ({ eq: () => ({ single: mocks.readWallet }) }) };
} }) }));
import { syncAccountingEvent, syncWorkspaceAccounting } from "./sync";

function event(status: "held" | "captured" | "released" = "captured", kind: "hold" | "inference" = "inference"): LedgerEvent {
    return { version: 1, workspaceId: "workspace", allocationId: "workspace:workspace", sequence: 1,
        balanceNanos: 8_000_000_000, reservedNanos: 0,
        reservation: { id: "request", keyId: "key", kind, amountNanos: 2_000_000_000,
            actualNanos: status === "held" ? null : status === "released" ? 0 : 2_000_000_000,
            status, requestCount: 2, createdAt: 1 } };
}

describe("existing-accounting background synchronization", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.pending.mockResolvedValue([event()]);
        mocks.status.mockResolvedValue({ sequence: 1, acknowledged: 1 });
        mocks.readWallet.mockResolvedValue({ data: { balance_nanos: 8_000_000_000, reserved_nanos: 0 }, error: null });
        mocks.reserve.mockResolvedValue({ applied: true, status: "held" });
        mocks.settle.mockResolvedValue({ applied: true, status: "captured" });
        mocks.capture.mockResolvedValue({ alreadyApplied: true, status: "captured" });
        mocks.release.mockResolvedValue({ alreadyApplied: true, status: "released" });
    });
    it("uses the existing ordinary charge function with no extra hold or dollar cap", async () => {
        await syncAccountingEvent(event());
        expect(mocks.charge).toHaveBeenCalledWith({ workspaceId: "workspace", requestId: "request", cost_nanos: 2_000_000_000 });
        expect(mocks.reserve).not.toHaveBeenCalled();
    });
    it("reuses normal hold, settlement and release functions including idempotent results", async () => {
        await syncAccountingEvent(event("held", "hold"));
        await syncAccountingEvent(event("captured", "hold"));
        await syncAccountingEvent(event("released", "hold"));
        expect(mocks.reserve).toHaveBeenCalledWith({ workspaceId: "workspace", reservationId: "request", keyId: "key", amountNanos: 2_000_000_000, requestCount: 2, holdRefId: undefined });
        expect(mocks.settle).toHaveBeenCalledWith({ workspaceId: "workspace", reservationId: "request", keyId: "key", actualNanos: 2_000_000_000, settleRefId: undefined });
        expect(mocks.release).toHaveBeenCalledOnce();
    });
    it("preserves capture semantics and the original billing reference", async () => {
        await syncAccountingEvent({ ...event("captured", "hold"), operation: "capture", referenceId: "video_1" });
        expect(mocks.capture).toHaveBeenCalledWith({ workspaceId: "workspace", reservationId: "request", keyId: "key", captureRefId: "video_1" });
        expect(mocks.settle).not.toHaveBeenCalled();
    });
    it("acknowledges only after billing succeeds and imports the ordinary wallet snapshot", async () => {
        mocks.charge.mockImplementation(async () => { expect(mocks.acknowledge).not.toHaveBeenCalled(); });
        await syncWorkspaceAccounting("workspace");
        expect(mocks.acknowledge).toHaveBeenCalledWith(1);
        expect(mocks.refresh).toHaveBeenCalledWith({ sequence: 1, balanceNanos: 8_000_000_000, reservedNanos: 0 });
    });
    it("retains an uncertain charge for an identical idempotent retry", async () => {
        mocks.charge.mockRejectedValueOnce(new Error("response_lost"));
        await expect(syncWorkspaceAccounting("workspace")).rejects.toThrow("response_lost");
        expect(mocks.acknowledge).not.toHaveBeenCalled();
        expect(mocks.readWallet).not.toHaveBeenCalled();
        await syncWorkspaceAccounting("workspace");
        expect(mocks.charge.mock.calls[0]).toEqual(mocks.charge.mock.calls[1]);
        expect(mocks.acknowledge).toHaveBeenCalledTimes(1);
    });
    it("does not acknowledge a rejected existing reservation RPC", async () => {
        mocks.pending.mockResolvedValue([event("held", "hold")]);
        mocks.reserve.mockResolvedValue({ applied: false, alreadyApplied: false, status: "daily_cost_limit_reached" });
        await expect(syncWorkspaceAccounting("workspace")).rejects.toThrow("request_state_billing_sync_failed:daily_cost_limit_reached");
        expect(mocks.acknowledge).not.toHaveBeenCalled();
    });
    it("does not refresh a balance while more local events remain", async () => {
        mocks.status.mockResolvedValue({ sequence: 2, acknowledged: 1 });
        await syncWorkspaceAccounting("workspace");
        expect(mocks.readWallet).not.toHaveBeenCalled();
        expect(mocks.refresh).not.toHaveBeenCalled();
    });
    it("rejects another workspace before billing or reading its wallet", async () => {
        await expect(syncWorkspaceAccounting("other")).rejects.toThrow("workspace_not_published");
        mocks.pending.mockResolvedValue([{ ...event(), workspaceId: "other" }]);
        await expect(syncWorkspaceAccounting("workspace")).rejects.toThrow("billing_sync_workspace_mismatch");
        expect(mocks.charge).not.toHaveBeenCalled();
        expect(mocks.readWallet).not.toHaveBeenCalled();
    });
});
