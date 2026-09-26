import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const { from, select, eq, retry, maybeSingle } = vi.hoisted(() => ({
    from: vi.fn(), select: vi.fn(), eq: vi.fn(), retry: vi.fn(), maybeSingle: vi.fn(),
}));
vi.mock("@/runtime/env", async importOriginal => ({
    ...await importOriginal<typeof import("@/runtime/env")>(),
    getSupabaseAdmin: () => ({ from }),
}));
import { internalCacheRoutes as routes } from "./cache";
import { readWorkspacePublicationStatus } from "@/core/workspace-publication-status";

const workspace = "10000000-0000-4000-8000-000000000001";
const token = "fixture-operator-token-".repeat(8);
const now = "2026-09-26T00:00:00.000Z";
const past = "2026-09-25T23:59:00.000Z";
const future = "2026-09-26T00:01:00.000Z";
const row = { workspace_id: workspace, attempts: 0, created_at: past, available_at: past, lease_until: null };
const env = { GATEWAY_CACHE: {}, SUPABASE_URL: "https://source.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture-only",
    GATEWAY_INTERNAL_TEST_TOKEN: token, GATEWAY_WORKSPACE_PUBLICATION_ENABLED: "true" };
const execution = { waitUntil: vi.fn(), passThroughOnException: vi.fn() };
function request(id = workspace, headers: Record<string, string> = { "x-internal-token": token }, bindings = env, method = "GET") {
    return routes.request(`/workspace-publication/${id}`, { method, headers }, bindings as never, execution as never);
}
beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers(); vi.setSystemTime(new Date(now));
    from.mockReturnValue({ select }); select.mockReturnValue({ eq }); eq.mockReturnValue({ retry }); retry.mockReturnValue({ maybeSingle });
    maybeSingle.mockResolvedValue({ data: row, error: null });
});
afterEach(() => vi.useRealTimers());

describe("operator publication inspection", () => {
    it.each([{}, { "x-internal-token": "wrong" }, { authorization: `Bearer ${token}` }])("denies unauthorized reads before database access: %j", async headers => {
        const response = await request(workspace, headers);
        expect(response.status).toBe(401);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(from).not.toHaveBeenCalled();
    });
    it("rejects weak configured tokens and disabled publication without I/O", async () => {
        expect((await request(workspace, { "x-internal-token": "short" }, { ...env, GATEWAY_INTERNAL_TEST_TOKEN: "short" })).status).toBe(401);
        expect((await request(workspace, undefined, { ...env, GATEWAY_WORKSPACE_PUBLICATION_ENABLED: "false" })).status).toBe(404);
        expect(from).not.toHaveBeenCalled();
    });
    it("rejects invalid targets and does not provide a mutation endpoint", async () => {
        expect((await request("not-a-uuid")).status).toBe(400);
        expect((await request(workspace, undefined, env, "POST")).status).toBe(404);
        await expect(readWorkspacePublicationStatus("invalid")).rejects.toThrow("invalid_workspace_id");
        expect(from).not.toHaveBeenCalled();
    });
    it.each([
        [0, past, null, "pending"], [9, future, null, "backoff"],
        [1, past, future, "leased"], [10, past, future, "leased"],
        [10, future, null, "exhausted"], [10, past, past, "exhausted"],
        [10, past, now, "exhausted"], [9, past, past, "pending"],
        [0, now, null, "pending"],
    ])("classifies attempts=%s available=%s lease=%s as %s", async (attempts, available_at, lease_until, state) => {
        maybeSingle.mockResolvedValue({ data: { ...row, attempts, available_at, lease_until, revision: "hidden", lease_id: "hidden" }, error: null });
        const response = await request();
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(await response.json()).toEqual({ data: { state, attempts, createdAt: past, availableAt: available_at, leaseUntil: lease_until } });
        expect(from).toHaveBeenCalledExactlyOnceWith("gateway_workspace_publications");
        expect(select).toHaveBeenCalledExactlyOnceWith("workspace_id,attempts,created_at,available_at,lease_until");
        expect(eq).toHaveBeenCalledExactlyOnceWith("workspace_id", workspace);
        expect(maybeSingle).toHaveBeenCalledOnce();
        expect(retry).toHaveBeenCalledExactlyOnceWith(false);
    });
    it("does not equate missing intent with verified freshness", async () => {
        maybeSingle.mockResolvedValue({ data: null, error: null });
        expect(await (await request()).json()).toEqual({ data: { state: "not_pending" } });
    });
    it.each([
        undefined, {}, { ...row, workspace_id: "20000000-0000-4000-8000-000000000002" },
        { ...row, attempts: 11 }, { ...row, attempts: -1 }, { ...row, attempts: 0.5 },
        { ...row, lease_until: "tomorrow" }, { ...row, available_at: "invalid" },
    ])("fails closed on invalid source data: %j", async data => {
        maybeSingle.mockResolvedValue({ data, error: null });
        const response = await request();
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: "workspace_publication_status_unavailable" });
    });
    it("redacts source failures, including thrown errors, without retrying", async () => {
        maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "secret source details" } }).mockRejectedValueOnce(new Error("secret source details"));
        for (let i = 0; i < 2; i++) {
            const response = await request();
            expect(response.status).toBe(503);
            expect(response.headers.get("cache-control")).toBe("private, no-store");
            expect(await response.text()).not.toContain("secret");
        }
        expect(maybeSingle).toHaveBeenCalledTimes(2);
    });
    it("is available to operators when only the drain is enabled", async () => {
        const response = await request(workspace, undefined, { ...env, GATEWAY_WORKSPACE_PUBLICATION_ENABLED: "false", GATEWAY_WORKSPACE_PUBLICATION_DRAIN_ENABLED: "true" } as typeof env);
        expect(response.status).toBe(200);
    });
});
