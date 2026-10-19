import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	rpc: vi.fn(),
	dispatched: [] as Array<Promise<unknown>>,
	adminThrows: false,
}));

vi.mock("./context", () => ({ fetchGatewayContext: vi.fn() }));

vi.mock("@/runtime/env", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/runtime/env")>()),
	getBindingsIfConfigured: () => ({ MOBILE_PUSH_ENABLED: "true" }),
	getSupabaseAdmin: () => {
		if (state.adminThrows) throw new Error("runtime not configured");
		return { rpc: state.rpc };
	},
	dispatchBackground: (promise: Promise<unknown>) => {
		state.dispatched.push(promise.catch((error) => error));
	},
}));

const { guardContext } = await import("./guards");
const { fetchGatewayContext } = await import("./context");
const { resetRememberedSpendLimits } = await import("../notifications/spend-limit-alerts");

function blockedContext(reason: string) {
	return {
		workspaceId: "ws_1",
		key: { ok: true, reason: null, resetAt: null },
		keyLimit: {
			ok: false,
			reason,
			resetAt: "2026-11-01T00:00:00.000Z",
			now: "2026-10-19T12:00:00.000Z",
			limitWindow: "monthly",
			limitMetric: reason === "key_limit_soft_blocked" ? "soft_blocked" : "cost",
			currentValue: 100_000_000_000,
			limitValue: 100_000_000_000,
			buckets: null,
		},
	} as any;
}

const request = (overrides: Record<string, unknown> = {}) => guardContext({
	workspaceId: "ws_1",
	apiKeyId: "key_1",
	endpoint: "responses" as any,
	capability: "text.generate",
	model: "openai/gpt-4.1-mini",
	requestId: "req_1",
	...overrides,
});

describe("budget alerts from rejected requests", () => {
	beforeEach(() => {
		state.rpc.mockReset();
		state.dispatched = [];
		state.adminThrows = false;
		resetRememberedSpendLimits();
	});

	it("returns the rejection without waiting for the alert, which is still in flight", async () => {
		// The database call never settles: if the request waited for it, this test would time out.
		state.rpc.mockReturnValue(new Promise(() => {}));
		vi.mocked(fetchGatewayContext).mockResolvedValue(blockedContext("workspace_monthly_cost_budget_reached"));

		const result = await request();

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.response.status).toBe(429);
		expect(await result.response.json()).toMatchObject({ error: "key_limit_exceeded", reason: "workspace_monthly_cost_budget_reached" });
		expect(state.rpc).toHaveBeenCalledWith("record_spend_limit_reached", {
			p_workspace_id: "ws_1",
			p_key_id: null,
			p_reason: "workspace_monthly_cost_budget_reached",
		});
		let settled = false;
		void state.dispatched[0].then(() => { settled = true; });
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(settled).toBe(false);
	});

	it("records a key limit once however often the key retries", async () => {
		state.rpc.mockResolvedValue({ data: true, error: null });
		vi.mocked(fetchGatewayContext).mockResolvedValue(blockedContext("monthly_cost_limit_reached"));

		for (let attempt = 0; attempt < 20; attempt += 1) expect((await request()).ok).toBe(false);

		expect(state.rpc).toHaveBeenCalledTimes(1);
		expect(state.rpc).toHaveBeenCalledWith("record_spend_limit_reached", { p_workspace_id: "ws_1", p_key_id: "key_1", p_reason: "monthly_cost_limit_reached" });
	});

	it("gives the same rejection when the alert path is broken", async () => {
		state.adminThrows = true;
		vi.mocked(fetchGatewayContext).mockResolvedValue(blockedContext("daily_request_limit_reached"));

		const result = await request();

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.response.status).toBe(429);
		expect(String(await state.dispatched[0])).toContain("runtime not configured");
	});

	it("does not alert for soft-blocked keys or internal requests", async () => {
		vi.mocked(fetchGatewayContext).mockResolvedValue(blockedContext("key_limit_soft_blocked"));
		expect((await request()).ok).toBe(false);
		vi.mocked(fetchGatewayContext).mockResolvedValue(blockedContext("monthly_cost_limit_reached"));
		await request({ internal: true });

		expect(state.rpc).not.toHaveBeenCalled();
		expect(state.dispatched).toHaveLength(0);
	});
});
