import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ reserve: vi.fn(), capture: vi.fn(), release: vi.fn() }));
vi.mock("./wallet-reservations", () => ({ reserveWalletCredits: mocks.reserve,
    captureWalletReservation: mocks.capture, releaseWalletReservation: mocks.release }));
import { reserveFreeModelOverage, finalizeFreeModelOverage } from "./free-model-reservations";
const identity = { workspaceId: "10000000-0000-4000-8000-000000000001",
    keyId: "20000000-0000-4000-8000-000000000001", requestId: "G-server-owned" };
beforeEach(() => { vi.resetAllMocks(); });
describe("free-model fee reservations", () => {
    it("reserves exactly one quoted fee with key and workspace limits intact", async () => {
        mocks.reserve.mockResolvedValue({ applied: true, status: "held", amountNanos: 100_000 });
        await reserveFreeModelOverage(identity);
        expect(mocks.reserve).toHaveBeenCalledExactlyOnceWith({ workspaceId: identity.workspaceId, keyId: identity.keyId,
            reservationId: "free_model_hold:G-server-owned", holdRefId: identity.requestId, amountNanos: 100_000, requestCount: 1 });
        expect(mocks.capture).not.toHaveBeenCalled();
    });
    it.each([{ keyId: "" }, { workspaceId: "other" }, { requestId: "x".repeat(129) }, { requestId: "" }])(
        "rejects invalid identity before I/O: %j", async overrides => {
            await expect(reserveFreeModelOverage({ ...identity, ...overrides })).rejects.toThrow();
            expect(mocks.reserve).not.toHaveBeenCalled();
        });
    it.each(["held", "captured"])("rejects mismatched successful %s confirmations", async status => {
        mocks.reserve.mockResolvedValue({ applied: true, status, amountNanos: 1 });
        await expect(reserveFreeModelOverage(identity)).rejects.toThrow("confirmation_invalid");
    });
    it("preserves a definitive budget denial without capture", async () => {
        const denied = { applied: false, alreadyApplied: false, status: "daily_cost_limit_reached", amountNanos: 100_000 };
        mocks.reserve.mockResolvedValue(denied);
        expect(await reserveFreeModelOverage(identity)).toBe(denied);
        expect(mocks.capture).not.toHaveBeenCalled();
    });
    it.each(["capture", "release"] as const)("keeps the same identity for %s and validates replay", async outcome => {
        const operation = mocks[outcome];
        operation.mockResolvedValue({ alreadyApplied: true, status: outcome === "capture" ? "captured" : "released", amountNanos: 100_000 });
        await finalizeFreeModelOverage(identity, outcome);
        expect(operation).toHaveBeenCalledExactlyOnceWith({ workspaceId: identity.workspaceId, keyId: identity.keyId,
            reservationId: "free_model_hold:G-server-owned", [`${outcome}RefId`]: identity.requestId });
        expect(mocks.reserve).not.toHaveBeenCalled();
    });
    it("does not turn an ambiguous capture into a release or a second debit", async () => {
        mocks.capture.mockRejectedValue(new Error("lost confirmation"));
        await expect(finalizeFreeModelOverage(identity, "capture")).rejects.toThrow("lost confirmation");
        expect(mocks.capture).toHaveBeenCalledOnce();
        expect(mocks.release).not.toHaveBeenCalled();
        expect(mocks.reserve).not.toHaveBeenCalled();
    });
    it("does not confirm settlement of a released or absent reservation", async () => {
        mocks.capture.mockResolvedValue({ applied: false, alreadyApplied: false, status: "not_found", amountNanos: 0 });
        await expect(finalizeFreeModelOverage(identity, "capture")).rejects.toThrow("settlement_unconfirmed");
    });
});
