import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountFreeModelQuotaRouter as router } from "./free-model-quota";

const data = { allowOverage: false, policyVersion: 2, requestsUsedToday: 4, requestsIncluded: 1500,
    rpm: 25, overageFeeNanos: 100000, resetsAtMs: 86400000, overageAvailable: false };
const fetchMock = vi.fn();
const env = { ENV: "staging", GATEWAY_API_ORIGIN: "https://staging.invalid/" } as never;
function call(method = "GET", body?: unknown, headers: Record<string, string> = {}) {
    return router.request("/?ownerId=other&workspaceId=other", { method,
        headers: { authorization: "Bearer session", ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }, env);
}
beforeEach(() => { fetchMock.mockReset().mockResolvedValue(Response.json({ data })); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());

describe("owner quota dashboard proxy", () => {
    it("forwards only the session to the configured gateway and strips target/credential headers", async () => {
        const response = await call("GET", undefined, { cookie: "secret", "x-owner-id": "other", "x-control-secret": "secret" });
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(await response.json()).toEqual({ data });
        expect(fetchMock).toHaveBeenCalledExactlyOnceWith("https://staging.invalid/internal/free-model-quota", expect.objectContaining({
            method: "GET", headers: { authorization: "Bearer session", "content-type": "application/json" }, redirect: "error", signal: expect.any(AbortSignal),
        }));
    });
    it("does no upstream work without a bearer session", async () => {
        expect((await call("GET", undefined, { authorization: "" })).status).toBe(401);
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it("forwards one version-fenced disable without retries", async () => {
        expect((await call("PATCH", { allowOverage: false, expectedVersion: 1 })).status).toBe(200);
        expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ allowOverage: false, expectedVersion: 1 }));
        expect(fetchMock).toHaveBeenCalledOnce();
    });
    it("rejects owner selection and oversized bodies before forwarding", async () => {
        expect((await call("PATCH", { allowOverage: false, expectedVersion: 1, ownerId: "other" })).status).toBe(400);
        expect((await call("PATCH", "x".repeat(513))).status).toBe(413);
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it.each([401, 404, 409, 429, 503])("preserves safe gateway status %i without retries", async status => {
        fetchMock.mockResolvedValue(Response.json({ error: "free_model_quota_unavailable" }, { status }));
        const response = await call();
        expect(response.status).toBe(status);
        if (status === 429) expect(response.headers.get("retry-after")).toBe("60");
        expect(fetchMock).toHaveBeenCalledOnce();
    });
    it("returns authoritative state on a version conflict", async () => {
        fetchMock.mockResolvedValue(Response.json({ error: "policy_version_conflict", data }, { status: 409 }));
        expect(await (await call("PATCH", { allowOverage: false, expectedVersion: 0 })).json()).toEqual({ error: "policy_version_conflict", data });
    });
    it("redacts malformed and unexpected upstream responses", async () => {
        fetchMock.mockResolvedValueOnce(Response.json({ data: { secret: "private" } }))
            .mockResolvedValueOnce(Response.json({ error: "private upstream detail" }, { status: 503 }));
        for (let i = 0; i < 2; i++) {
            const response = await call();
            expect(response.status).toBe(503);
            expect(await response.json()).toEqual({ error: "free_model_quota_unavailable" });
        }
    });
    it("does not repeat an ambiguously completed PATCH", async () => {
        fetchMock.mockRejectedValue(new Error("timeout with credentials"));
        const response = await call("PATCH", { allowOverage: false, expectedVersion: 0 });
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: "free_model_quota_unavailable" });
        expect(fetchMock).toHaveBeenCalledOnce();
    });
});
