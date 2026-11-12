import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	rpc: vi.fn(),
	dispatched: [] as Array<Promise<unknown>>,
	adminThrows: false,
	shadow: vi.fn(),
	mode: "off" as string,
	decide: vi.fn(),
	footprint: vi.fn(),
}));

// Mirrors enforcedSpendLimit's contract (spend-limits.test.ts covers the real one): a decision
// only in enforce mode for non-internal requests with a slot, computed once per slot.
vi.mock("@core/spend-limits", () => ({
	shadowSpendLimitOnce: state.shadow,
	startSpendLimitFootprint: (args: { internal?: boolean; slot?: { decision: Promise<unknown> | null } | null }) =>
		!args.slot || args.slot.decision || args.internal || state.mode !== "enforce" ? null : state.footprint(args),
	enforcedSpendLimit: (args: { internal?: boolean; slot?: { decision: Promise<unknown> | null } | null }) => {
		if (!args.slot || args.internal || state.mode !== "enforce") return null;
		args.slot.decision ??= Promise.resolve(state.decide(args));
		return args.slot.decision;
	},
}));

vi.mock("./retiredModels", () => ({ findRetiredModelNotice: async () => null, describeRetiredModel: () => "" }));

vi.mock("./context", () => ({ fetchGatewayContext: vi.fn() }));

vi.mock("@/runtime/env", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/runtime/env")>()),
	getBindingsIfConfigured: () => ({ MOBILE_PUSH_ENABLED: "false" }),
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
		state.shadow.mockReset();
		state.mode = "off";
		state.decide.mockReset();
		state.footprint.mockReset();
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
		expect(await result.response.json()).toMatchObject({ code: "key_limit_exceeded", reason: "workspace_monthly_cost_budget_reached" });
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

	it("hands the legacy decision to the spend-limit shadow for opted-in capped API keys only", async () => {
		state.rpc.mockResolvedValue({ data: true, error: null });
		const blocked = blockedContext("daily_request_limit_reached");
		vi.mocked(fetchGatewayContext).mockResolvedValue(blocked);
		expect((await request({ shadowSpendLimit: true })).ok).toBe(false);
		expect(state.shadow).toHaveBeenCalledWith({ workspaceId: "ws_1", keyId: "key_1", requestId: "req_1" }, blocked.keyLimit);

		state.shadow.mockClear();
		await request({ shadowSpendLimit: true, internal: true });
		// Batch and realtime callers, and OAuth requests, do not opt in.
		await request();
		// An allowed key without limits or budgets has nothing to compare.
		vi.mocked(fetchGatewayContext).mockResolvedValue({ ...blocked, keyLimit: { ok: true, reason: null, resetAt: null, buckets: null, budgets: [] } });
		await request({ shadowSpendLimit: true });
		expect(state.shadow).not.toHaveBeenCalled();
	});

	describe("enforce mode", () => {
		const slot = () => ({ attempt: "a1", decision: null as Promise<unknown> | null });
		const allowedContext = () => ({ ...blockedContext("x"), keyLimit: { ok: true, reason: null, resetAt: null, buckets: null, budgets: [] } });
		const departmentDenial = {
			outcome: "denied", admission: null, source: "coordinator", contended: false,
			keyLimit: {
				ok: false, reason: "department_daily_cost_budget_reached", resetAt: "2026-10-20T00:00:00.000Z", now: "2026-10-19T12:00:00.000Z",
				limitWindow: "daily", limitMetric: "cost", currentValue: 11_000_000_000, limitValue: 10_000_000_000,
				departmentId: "dept_1", departmentName: "Engineering",
			},
		};

		beforeEach(() => { state.mode = "enforce"; });

		it("records how long the request waited for the coordinator's decision", async () => {
			// A controlled clock: it moves 42 ms only when the decision resolves, so no real time passes.
			let now = 1_000;
			const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
			state.decide.mockImplementation(() => Promise.resolve().then(() => {
				now += 42;
				return { outcome: "allowed", admission: null, source: "coordinator", contended: false };
			}));
			const context = { ...allowedContext(), contextTelemetry: { cacheStatus: "hit", totalMs: 3 } };
			vi.mocked(fetchGatewayContext).mockResolvedValue(context);

			try {
				await request({ spendLimit: slot() });
			} finally {
				clock.mockRestore();
			}

			expect((context.contextTelemetry as { spendLimitMs?: number }).spendLimitMs).toBe(42);
		});

		it("records no coordinator wait when enforce mode is off", async () => {
			state.mode = "off";
			const context = { ...allowedContext(), contextTelemetry: { cacheStatus: "hit", totalMs: 3 } };
			vi.mocked(fetchGatewayContext).mockResolvedValue(context);

			await request({ spendLimit: slot() });

			expect(context.contextTelemetry).not.toHaveProperty("spendLimitMs");
		});

		it("rejects a request the coordinator denies, naming the department", async () => {
			state.decide.mockReturnValue(departmentDenial);
			vi.mocked(fetchGatewayContext).mockResolvedValue(allowedContext());

			const result = await request({ spendLimit: slot() });

			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.response.status).toBe(429);
			expect(result.response.headers.get("Retry-After")).toBe(String(12 * 3600));
			expect(await result.response.json()).toMatchObject({
				code: "key_limit_exceeded",
				reason: "department_daily_cost_budget_reached",
				limit_window: "daily",
				limit_metric: "cost",
				department_id: "dept_1",
				department_name: "Engineering",
				description: "The Engineering department has reached its daily budget ($11.00 of $10.00).",
			});
			// The department sweep sends the 100% alert; rejections do not record one.
			expect(state.rpc).not.toHaveBeenCalled();
		});

		it("lets an allowed coordinator decision override the legacy denial", async () => {
			state.decide.mockReturnValue({ outcome: "allowed", keyLimit: { ok: true, reason: null, resetAt: null }, admission: {}, source: "lease" });
			vi.mocked(fetchGatewayContext).mockResolvedValue(blockedContext("daily_request_limit_reached"));

			const result = await request({ spendLimit: slot() });

			expect(result.ok).toBe(false);
			if (result.ok) return;
			// Past the key-limit gate: this fixture has no providers.
			expect((await result.response.json()).code).not.toBe("key_limit_exceeded");
		});

		it("falls back to the legacy check when the coordinator is unavailable or not asked", async () => {
			state.rpc.mockResolvedValue({ data: true, error: null });
			state.decide.mockReturnValue({ outcome: "unavailable", keyLimit: null, admission: null, error: "spend_limit_binding_missing" });
			vi.mocked(fetchGatewayContext).mockResolvedValue(blockedContext("daily_request_limit_reached"));

			for (const overrides of [{ spendLimit: slot() }, {}]) {
				const result = await request(overrides);
				expect(result.ok).toBe(false);
				if (result.ok) return;
				expect(await result.response.json()).toMatchObject({ code: "key_limit_exceeded", reason: "daily_request_limit_reached" });
			}
			// Off and shadow modes never ask the coordinator.
			state.mode = "shadow";
			await request({ spendLimit: slot() });
			expect(state.decide).toHaveBeenCalledTimes(1);
		});

		it("starts the footprint read before loading the context and hands it over with the context's key-limit check", async () => {
			const order: string[] = [];
			const footprint = Promise.resolve({ keyLimited: false, softBlocked: false, workspaceBudgets: false, departmentBudgets: false, spendGuardrails: false });
			state.footprint.mockImplementation(() => { order.push("footprint"); return footprint; });
			state.decide.mockReturnValue({ outcome: "allowed", keyLimit: { ok: true, reason: null, resetAt: null }, admission: {}, source: "footprint" });
			const context = allowedContext();
			vi.mocked(fetchGatewayContext).mockImplementation(async () => { order.push("context"); return context; });

			await request({ spendLimit: slot() });

			expect(order).toEqual(["footprint", "context"]);
			expect(state.footprint).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "ws_1", keyId: "key_1" }));
			expect(state.decide).toHaveBeenCalledWith(expect.objectContaining({ footprint, keyLimit: context.keyLimit }));
		});

		it("reads no footprint once the request's slot is decided, or outside enforce mode", async () => {
			state.decide.mockReturnValue(departmentDenial);
			vi.mocked(fetchGatewayContext).mockResolvedValue(allowedContext());
			const shared = slot();
			await request({ spendLimit: shared });
			await request({ spendLimit: shared, model: "anthropic/claude-5" });
			expect(state.footprint).toHaveBeenCalledTimes(1);
			state.mode = "shadow";
			await request({ spendLimit: slot() });
			expect(state.footprint).toHaveBeenCalledTimes(1);
		});

		it("decides once per request however many candidate models are checked", async () => {
			state.decide.mockReturnValue(departmentDenial);
			vi.mocked(fetchGatewayContext).mockResolvedValue(allowedContext());
			const shared = slot();

			for (const model of ["openai/gpt-4.1-mini", "anthropic/claude-5", "google/gemini-4"]) {
				const result = await request({ spendLimit: shared, model });
				expect(result.ok).toBe(false);
			}
			expect(state.decide).toHaveBeenCalledTimes(1);
		});
	});
});
