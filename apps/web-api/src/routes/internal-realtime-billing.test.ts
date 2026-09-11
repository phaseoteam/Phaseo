import { beforeEach, expect, it, vi } from "vitest";
import { internalRealtimeBillingRouter } from "./internal-realtime-billing";
const state = vi.hoisted(() => ({ user: { id: "admin-id" } as { id: string } | null, role: "admin", rpc: vi.fn(), query: {} as any }));
vi.mock("@/auth/requireUser", () => ({ requireUser: async () => state.user }));
vi.mock("@/data/supabase", () => ({ getDataClient: () => ({ from: () => state.query, rpc: state.rpc }) }));
beforeEach(() => {
	state.user = { id: "admin-id" }; state.role = "admin"; state.rpc.mockReset();
	state.rpc.mockResolvedValue({ data: { applied: true }, error: null });
	const query: any = { then: (resolve: any) => resolve({ data: [], count: 0, error: null }) };
	for (const method of ["select", "eq", "order", "range", "limit"]) query[method] = vi.fn(() => query);
	query.maybeSingle = vi.fn(async () => ({ data: { role: state.role }, error: null }));
	state.query = query;
});
const body = { operation_id: "00000000-0000-4000-8000-000000000001", version: 3, action: "write_off", reason: "Verified service incident." };
const request = (payload = body, headers = {}) => internalRealtimeBillingRouter.request("https://local/realtime-billing/reviews/rt_test/decisions",
	{ method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(payload) }, {});

it.each([null, "member"])("denies %s without touching the billing RPC", async (role) => {
	if (role === null) state.user = null; else state.role = role;
	expect((await request()).status).toBe(403); expect(state.rpc).not.toHaveBeenCalled();
});
it("rejects cross-site requests and user-supplied charge/actor fields", async () => {
	expect((await request(body, { "sec-fetch-site": "cross-site" })).status).toBe(403);
	for (const extra of [{ cost_nanos: 5e9 }, { actor_user_id: "other" }, { usage: {} }]) {
		expect((await request({ ...body, ...extra })).status).toBe(400);
	}
	expect(state.rpc).not.toHaveBeenCalled();
});
it("derives actor from verified auth and preserves idempotency and version", async () => {
	const response = await request(); expect(response.status).toBe(200);
	expect(response.headers.get("cache-control")).toContain("no-store");
	expect(state.rpc).toHaveBeenCalledWith("gateway_realtime_review_decide", {
		p_session_id: "rt_test", p_actor_user_id: "admin-id", p_operation_id: body.operation_id,
		p_expected_version: 3, p_action: "write_off", p_reason: body.reason,
	});
});
it("returns a conflict for stale evidence, not success", async () => {
	state.rpc.mockResolvedValue({ error: { message: "realtime_review_stale", code: "P0001" } });
	const response = await request(); expect(response.status).toBe(409);
	expect(await response.json()).toEqual({ error: "realtime_review_stale" });
});
it("authorizes reads and caps queue pagination", async () => {
	const url = "https://local/realtime-billing/reviews?offset=1000000";
	state.user = null; expect((await internalRealtimeBillingRouter.request(url, {}, {})).status).toBe(403);
	state.user = { id: "admin-id" };
	expect((await internalRealtimeBillingRouter.request(url, {}, {})).status).toBe(200);
	expect(state.query.range).toHaveBeenCalledWith(10000, 10049);
});
