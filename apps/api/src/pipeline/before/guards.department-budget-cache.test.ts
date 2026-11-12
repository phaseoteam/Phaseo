import { beforeEach, describe, expect, it, vi } from "vitest";

// Successive requests of a key whose department budget is crossed between them, while the
// SpendLimit Durable Object cannot decide (no binding): the legacy request-context check alone
// decides, so the context must be read fresh each time, never from the gateway cache.
const runtime = vi.hoisted(() => {
	const store = new Map<string, string>();
	const background: Promise<unknown>[] = [];
	const cache = {
		get: vi.fn(async (key: string | string[]) => {
			if (Array.isArray(key)) {
				return new Map(key.flatMap((entry) => {
					const value = store.get(entry);
					return value == null ? [] : [[entry, value] as const];
				}));
			}
			return store.get(key) ?? null;
		}),
		put: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
		delete: vi.fn(async (key: string) => { store.delete(key); }),
	};
	const budget = (usage: number) => ({
		id: "budget-1", department_id: "dept-1", department_name: "Engineering", interval: "daily",
		limit_nanos: 10_000_000_000, usage_nanos: usage, remaining_nanos: Math.max(0, 10_000_000_000 - usage),
		exceeded: usage >= 10_000_000_000, window_start: "2026-11-04T00:00:00+00:00", reset_at: "2026-11-05T00:00:00+00:00",
	});
	const payload = (keyLimit: Record<string, unknown>) => ({
		workspace_id: "workspace_dept",
		resolved_model: "openai/gpt-5.4-nano",
		key_ok: { ok: true, reason: null },
		key_limit_ok: keyLimit,
		credit_ok: { ok: true, reason: null, balance_nanos: 40_000_000_000 },
		providers: [],
		pricing: {},
	});
	// What gateway_fetch_request_context returns below the budget, then once it is reached.
	const below = payload({ ok: true, reason: null, department_budgets: [budget(9_000_000_000)] });
	const reached = payload({
		ok: false, reason: "department_daily_cost_budget_reached", limit_window: "daily", limit_metric: "cost",
		current_value: 10_500_000_000, limit_value: 10_000_000_000, reset_at: "2026-11-05T00:00:00+00:00",
		now: "2026-11-04T12:00:00+00:00", department_id: "dept-1", department_name: "Engineering",
		department_budgets: [budget(10_500_000_000)],
	});
	const phase = { reached: false };
	const rpc = vi.fn(async () => ({ data: [phase.reached ? reached : below], error: null }));
	// Single-row reads get the workspace's settings; every other read finds nothing.
	const rowsByTable: Record<string, unknown> = {
		workspace_settings: { routing_mode: null, byok_fallback_enabled: false, beta_channel_enabled: false, alpha_channel_enabled: false, cache_aware_routing_enabled: true },
		workspaces: { billing_mode: "wallet" },
		wallets: { balance_nanos: 50_000_000_000, reserved_nanos: 0 },
	};
	const from = vi.fn((table: string) => {
		const empty = { data: [], count: 0, error: null };
		const query: any = new Proxy({}, {
			get: (_target, prop) => {
				if (prop === "then") return (resolve: (value: unknown) => unknown) => resolve(empty);
				if (prop === "maybeSingle" || prop === "single") return async () => ({ data: rowsByTable[table] ?? null, error: null });
				return () => query;
			},
		});
		return query;
	});
	return { store, background, cache, phase, supabase: { rpc, from } };
});

vi.mock("@/runtime/env", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/runtime/env")>()),
	getBindingsIfConfigured: () => null,
	getCache: () => runtime.cache as unknown as KVNamespace,
	getSupabaseAdmin: () => runtime.supabase,
	dispatchBackground: (promise: Promise<unknown>) => { runtime.background.push(promise.catch(() => undefined)); },
}));
vi.mock("./retiredModels", () => ({ findRetiredModelNotice: async () => null, describeRetiredModel: () => "" }));

const workspaceId = "workspace_dept";
const apiKeyId = "key_dept";

describe("department budgets with the spend-limit coordinator unavailable", () => {
	beforeEach(() => {
		runtime.store.clear();
		runtime.background.length = 0;
		runtime.phase.reached = false;
		runtime.supabase.rpc.mockClear();
		runtime.cache.put.mockClear();
		vi.resetModules();
	});

	it("refuses the request after the budget is crossed instead of reusing the earlier admission", async () => {
		runtime.store.set(`gateway:keyver:id:${apiKeyId}`, "1");
		const { guardContext } = await import("./guards");
		const attempt = (requestId: string) => guardContext({
			workspaceId, apiKeyId, endpoint: "chat.completions" as any, capability: "chat.completions",
			model: "openai/gpt-5.4-nano", requestId, spendLimit: { attempt: "a1", decision: null },
		});

		const first = await attempt("req-1");
		await Promise.all(runtime.background);
		// Below the budget: past the spend gate (this fixture serves no providers).
		expect(first.ok).toBe(false);
		if (first.ok) return;
		expect((await first.response.json()).code).not.toBe("key_limit_exceeded");
		// An admission with department budgets is never written to the dynamic context cache.
		expect(runtime.cache.put.mock.calls.map(([key]) => key).filter((key) => String(key).startsWith("gateway:dynamic:"))).toEqual([]);

		const firstReads = runtime.supabase.rpc.mock.calls.length;
		expect(firstReads).toBeGreaterThan(0);
		// The request's spend lands and crosses the budget.
		runtime.phase.reached = true;
		const second = await attempt("req-2");
		// Read from the database again, not from the cache.
		expect(runtime.supabase.rpc.mock.calls.length).toBeGreaterThan(firstReads);
		expect(second.ok).toBe(false);
		if (second.ok) return;
		expect(second.response.status).toBe(429);
		expect(await second.response.json()).toMatchObject({
			code: "key_limit_exceeded",
			reason: "department_daily_cost_budget_reached",
			department_id: "dept-1",
			department_name: "Engineering",
		});
	});
});
