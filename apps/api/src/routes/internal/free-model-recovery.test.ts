import { beforeEach, describe, expect, it, vi } from "vitest";
import { internalFreeModelRecoveryRoutes as routes } from "./free-model-recovery";
const owner = "10000000-0000-4000-8000-000000000001", workspaceId = "20000000-0000-4000-8000-000000000001";
const token = "fixture-operator-token-".repeat(8);
const feeReviews = vi.fn(), retryReviewedFee = vi.fn(), getByName = vi.fn(), limit = vi.fn();
const env = { GATEWAY_INTERNAL_TEST_TOKEN: token, FREE_MODEL_QUOTA: { getByName }, FREE_MODEL_RATE_LIMITER: { limit } };
const body = { workspaceId, requestId: "server", expectedAttempts: 5 };
const request = (method = "GET", input?: unknown, headers = { "x-internal-token": token }, id = owner) => routes.request(
    `/${id}${method === "POST" ? "/retry" : ""}`, { method, headers: { ...headers, "content-type": "application/json" },
        ...(input === undefined ? {} : { body: JSON.stringify(input) }) }, env as never);
beforeEach(() => {
    vi.clearAllMocks(); getByName.mockReturnValue({ feeReviews, retryReviewedFee });
    feeReviews.mockResolvedValue([]); retryReviewedFee.mockResolvedValue({ settled: true, review: false }); limit.mockResolvedValue({ success: true });
});
describe("fee operator recovery", () => {
    it.each([{}, { "x-internal-token": "wrong" }, { authorization: `Bearer ${token}` }])("denies untrusted callers before storage or rate calls", async headers => {
        expect((await request("GET", undefined, headers as any)).status).toBe(401);
        expect(limit).not.toHaveBeenCalled(); expect(getByName).not.toHaveBeenCalled();
    });
    it("exposes only bounded owner-selected review data, uncached", async () => {
        const result = await request(); expect(result.status).toBe(200);
        expect(result.headers.get("cache-control")).toBe("private, no-store");
        expect(getByName).toHaveBeenCalledWith(`owner:${owner}`); expect(await result.json()).toEqual({ data: [] });
    });
    it("retries the persisted decision with an attempt fence, never an outcome supplied by a caller", async () => {
        expect((await request("POST", body)).status).toBe(200);
        expect(retryReviewedFee).toHaveBeenCalledExactlyOnceWith(workspaceId, "server", 5);
        expect((await request("POST", { ...body, outcome: "capture" })).status).toBe(400);
        expect(retryReviewedFee).toHaveBeenCalledOnce();
    });
    it.each([{ ...body, expectedAttempts: 32 }, { ...body, expectedAttempts: -1 }, { ...body, workspaceId: "invalid" }])("rejects invalid financial identities/fences", async input => {
        expect((await request("POST", input)).status).toBe(400); expect(retryReviewedFee).not.toHaveBeenCalled();
    });
    it("never retries an ambiguous operator call or returns its diagnostics", async () => {
        retryReviewedFee.mockRejectedValue(new Error("private-details"));
        const result = await request("POST", body); expect(result.status).toBe(409);
        expect(await result.text()).not.toContain("private-details"); expect(retryReviewedFee).toHaveBeenCalledOnce();
    });
    it("rate-limits operators before coordinator access", async () => {
        limit.mockResolvedValue({ success: false }); expect((await request()).status).toBe(429);
        expect(getByName).not.toHaveBeenCalled();
    });
    it("caps request bodies and validates owner identity", async () => {
        expect((await request("POST", { payload: "x".repeat(900) })).status).toBe(413);
        expect((await request("GET", undefined, undefined, "invalid")).status).toBe(400);
        expect(getByName).not.toHaveBeenCalled();
    });
    it("returns a safe uncached error if the operator guard fails", async () => {
        limit.mockRejectedValueOnce(new Error("private-limit-details"));
        const result = await request(); expect(result.status).toBe(503);
        expect(result.headers.get("cache-control")).toBe("private, no-store");
        expect(await result.text()).not.toContain("private-limit-details");
    });
});
