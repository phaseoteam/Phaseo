import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	rpc: vi.fn(),
	dispatched: [] as Array<Promise<unknown>>,
	bindings: { MOBILE_PUSH_ENABLED: "true" } as Record<string, unknown> | null,
	adminThrows: false,
}));

vi.mock("@/runtime/env", () => ({
	getBindingsIfConfigured: () => state.bindings,
	dispatchBackground: (promise: Promise<unknown>) => {
		state.dispatched.push(promise.catch((error) => error));
	},
	getSupabaseAdmin: () => {
		if (state.adminThrows) throw new Error("runtime not configured");
		return { rpc: state.rpc };
	},
}));

const { noteSpendLimitReached, resetRememberedSpendLimits, runSpendLimitWarningSweep } = await import("./spend-limit-alerts");

const oct16 = new Date("2026-10-16T12:00:00Z");

describe("spend limit alerts", () => {
	beforeEach(() => {
		state.rpc.mockReset().mockResolvedValue({ data: true, error: null });
		state.dispatched = [];
		state.bindings = { MOBILE_PUSH_ENABLED: "true" };
		state.adminThrows = false;
		resetRememberedSpendLimits();
	});

	it("records a used-up budget or key limit in the background", async () => {
		noteSpendLimitReached({ workspaceId: "ws_1", keyId: "key_1", reason: "workspace_monthly_cost_budget_reached", now: oct16 });
		noteSpendLimitReached({ workspaceId: "ws_1", keyId: "key_1", reason: "daily_request_limit_reached", now: oct16 });
		await Promise.all(state.dispatched);

		expect(state.rpc.mock.calls).toEqual([
			["record_spend_limit_reached", { p_workspace_id: "ws_1", p_key_id: null, p_reason: "workspace_monthly_cost_budget_reached" }],
			["record_spend_limit_reached", { p_workspace_id: "ws_1", p_key_id: "key_1", p_reason: "daily_request_limit_reached" }],
		]);
	});

	it("ignores other rejections, a key limit without a key, and a missing runtime", () => {
		for (const reason of ["key_limit_soft_blocked", "insufficient_funds", "key_not_active", null]) {
			noteSpendLimitReached({ workspaceId: "ws_1", keyId: "key_1", reason, now: oct16 });
		}
		noteSpendLimitReached({ workspaceId: "ws_1", keyId: null, reason: "monthly_cost_limit_reached", now: oct16 });
		noteSpendLimitReached({ workspaceId: null, keyId: "key_1", reason: "monthly_cost_limit_reached", now: oct16 });
		state.bindings = null;
		noteSpendLimitReached({ workspaceId: "ws_1", keyId: "key_1", reason: "monthly_cost_limit_reached", now: oct16 });

		expect(state.dispatched).toHaveLength(0);
		expect(state.rpc).not.toHaveBeenCalled();
	});

	it("records on regional gateways too, where this worker sends no pushes", async () => {
		state.bindings = { MOBILE_PUSH_ENABLED: "false" };
		noteSpendLimitReached({ workspaceId: "ws_1", keyId: "key_1", reason: "monthly_cost_limit_reached", now: oct16 });
		await Promise.all(state.dispatched);

		expect(state.rpc).toHaveBeenCalledWith("record_spend_limit_reached", { p_workspace_id: "ws_1", p_key_id: "key_1", p_reason: "monthly_cost_limit_reached" });
	});

	it("calls the database once per isolate, limit and period while a workspace keeps retrying", async () => {
		const note = (reason: string, now: Date, keyId = "key_1") => noteSpendLimitReached({ workspaceId: "ws_1", keyId, reason, now });
		for (let attempt = 0; attempt < 50; attempt += 1) note("daily_request_limit_reached", oct16);
		note("daily_request_limit_reached", new Date("2026-10-16T12:30:00Z"));
		note("daily_request_limit_reached", oct16, "key_2");
		note("daily_request_limit_reached", new Date("2026-10-17T00:00:01Z"));
		note("monthly_cost_limit_reached", oct16);
		note("monthly_cost_limit_reached", new Date("2026-10-31T23:00:00Z"));
		note("weekly_cost_limit_reached", new Date("2026-10-18T23:00:00Z"));
		note("weekly_cost_limit_reached", new Date("2026-10-19T01:00:00Z"));
		await Promise.all(state.dispatched);

		// Retries within the hour are not passed on. A new day or week is a new call. An isolate only
		// remembers for an hour, so on 31 October the monthly limit is passed on again; the database
		// still keeps one alert for October.
		expect(state.rpc.mock.calls.map(([, args]) => `${args.p_key_id} ${args.p_reason}`)).toEqual([
			"key_1 daily_request_limit_reached",
			"key_2 daily_request_limit_reached",
			"key_1 daily_request_limit_reached",
			"key_1 monthly_cost_limit_reached",
			"key_1 monthly_cost_limit_reached",
			"key_1 weekly_cost_limit_reached",
			"key_1 weekly_cost_limit_reached",
		]);
	});

	it("tries again after a failed call, and never throws into the request", async () => {
		state.rpc.mockResolvedValueOnce({ data: null, error: { message: "connection reset" } });
		noteSpendLimitReached({ workspaceId: "ws_1", keyId: "key_1", reason: "monthly_cost_limit_reached", now: oct16 });
		const [failure] = await Promise.all(state.dispatched);
		expect(String(failure)).toContain("spend_limit_record_failed:connection reset");
		noteSpendLimitReached({ workspaceId: "ws_1", keyId: "key_1", reason: "monthly_cost_limit_reached", now: oct16 });
		expect(state.rpc).toHaveBeenCalledTimes(2);

		state.adminThrows = true;
		resetRememberedSpendLimits();
		expect(() => noteSpendLimitReached({ workspaceId: "ws_1", keyId: "key_1", reason: "monthly_cost_limit_reached", now: oct16 })).not.toThrow();
		expect(String(await state.dispatched.at(-1))).toContain("runtime not configured");
	});

	it("runs the 80% sweep and reports what it found", async () => {
		state.rpc.mockResolvedValueOnce({ data: { budgets: 2, limitedKeys: 37, warned: 1 }, error: null });
		await expect(runSpendLimitWarningSweep()).resolves.toEqual({ budgets: 2, limitedKeys: 37, warned: 1 });
		expect(state.rpc).toHaveBeenCalledWith("sweep_spend_limit_warnings", {});

		state.rpc.mockResolvedValueOnce({ data: null, error: { message: "timeout" } });
		await expect(runSpendLimitWarningSweep()).rejects.toThrow("spend_limit_sweep_failed:timeout");
	});
});
