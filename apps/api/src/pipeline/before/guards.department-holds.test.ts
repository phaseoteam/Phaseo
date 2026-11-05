import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Seed -> SpendLimit Durable Object -> guard, on the real SQL: a department whose finished spend
// is below its budget but whose outstanding video hold takes it over. The coordinator's decision
// overrides the request-context check (guards.ts), so its seed must count the hold too.
const runtime = vi.hoisted(() => ({
	bindings: null as Record<string, unknown> | null,
	background: [] as Promise<unknown>[],
	context: null as unknown,
	seed: null as unknown,
	seedCalls: [] as string[][],
}));

vi.mock("cloudflare:workers", () => ({
	DurableObject: class {
		constructor(public ctx: DurableObjectState, public env: unknown) {}
	},
}));
vi.mock("@/runtime/env", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/runtime/env")>()),
	getBindingsIfConfigured: () => runtime.bindings,
	getSupabaseAdmin: () => ({ rpc: async () => ({ data: null, error: null }) }),
	dispatchBackground: (promise: Promise<unknown>) => { runtime.background.push(promise.catch(() => undefined)); },
}));
vi.mock("@core/spend-limit-footprint", async (importOriginal) => ({
	...(await importOriginal<typeof import("@core/spend-limit-footprint")>()),
	readSpendLimitFootprint: async () => null,
}));
vi.mock("./context", () => ({ fetchGatewayContext: vi.fn(async () => runtime.context) }));
vi.mock("./retiredModels", () => ({ findRetiredModelNotice: async () => null, describeRetiredModel: () => "" }));

const { SpendLimitDurableObject } = await import("@core/spend-limit-durable-object");
const { checkSpendLimit, createSpendLimitSlot, __resetSpendLimitsForTests } = await import("@core/spend-limits");
const { guardContext } = await import("./guards");
const { contextSchema } = await import("./schemas");

const WORKSPACE = "10000000-0000-4000-8000-000000000001";
const DEPARTMENT = "40000000-0000-4000-8000-000000000001";
const LINKED_KEY = "30000000-0000-4000-8000-000000000001";
const MEMBER_KEY = "30000000-0000-4000-8000-000000000002";
const MEMBER = "20000000-0000-4000-8000-000000000001";
const DOLLAR = 1_000_000_000;

let db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>; exec: (sql: string) => Promise<unknown>; close: () => Promise<void> };
let sqlite: DatabaseSync;

beforeAll(async () => {
	const { PGlite } = await import("@electric-sql/pglite");
	const fixtureUrl = new URL("../../../../../supabase/tests/fixtures/budget-enforcement-db.mjs", import.meta.url).href;
	const fixture = await import(/* @vite-ignore */ fixtureUrl);
	db = await fixture.createBudgetDatabase(PGlite);
	const migration = await fixture.readMigration();
	await db.exec(migration);
	// The deployed seed: this migration's, or the declarative one when a migration does not replace it.
	if (!migration.includes("FUNCTION public.gateway_spend_limit_seed")) {
		await db.exec(await fixture.readSchema("public/functions/gateway_spend_limit_seed.sql"));
	}
	await db.exec(`
		insert into public.workspaces (id) values ('${WORKSPACE}');
		insert into public.wallets (workspace_id, balance_nanos) values ('${WORKSPACE}', ${100 * DOLLAR});
		insert into public.keys (id, workspace_id, department_id, created_by) values
			('${LINKED_KEY}', '${WORKSPACE}', '${DEPARTMENT}', null), ('${MEMBER_KEY}', '${WORKSPACE}', null, '${MEMBER}');
		insert into public.workspace_departments (id, workspace_id, name) values ('${DEPARTMENT}', '${WORKSPACE}', 'Engineering');
		insert into public.workspace_department_grants (workspace_id, user_id, department_id) values ('${WORKSPACE}', '${MEMBER}', '${DEPARTMENT}');
		insert into public.workspace_department_budgets (workspace_id, department_id, interval, limit_nanos) values ('${WORKSPACE}', '${DEPARTMENT}', 'daily', ${10 * DOLLAR});
		-- $9 spent, and a $2 video job still running on a member's key: $11 of $10.
		insert into public.gateway_requests (workspace_id, request_id, key_id, success, cost_nanos) values ('${WORKSPACE}', 'spent', '${LINKED_KEY}', true, ${9 * DOLLAR});
		insert into public.gateway_wallet_reservations (reservation_id, workspace_id, amount_nanos, status, hold_ref_id, key_id)
			values ('video_hold:running', '${WORKSPACE}', ${2 * DOLLAR}, 'reserved', 'video-running', '${MEMBER_KEY}');
	`);
	await db.exec("set role service_role");
	runtime.seed = (await db.query(`select public.gateway_spend_limit_seed($1, $2::uuid[]) as seed`, [WORKSPACE, [MEMBER_KEY]])).rows[0].seed;
	const context = (await db.query(`select public.gateway_fetch_request_context($1, 'openai/gpt-5.4-nano', 'responses', $2) as context`, [WORKSPACE, MEMBER_KEY])).rows[0].context;
	await db.exec("reset role");
	runtime.context = contextSchema.parse(context);

	// The real coordinator, reading the seed above (computed before the request so the
	// enforce wait is not spent on PGlite).
	class SeededSpendLimitDurableObject extends SpendLimitDurableObject {
		protected override async loadSeed(workspaceId: string, keyIds: string[]): Promise<any> {
			expect(workspaceId).toBe(WORKSPACE);
			runtime.seedCalls.push([...keyIds]);
			return runtime.seed;
		}
	}
	sqlite = new DatabaseSync(":memory:");
	const state = {
		blockConcurrencyWhile: (fn: () => Promise<unknown>) => fn(),
		storage: {
			sql: {
				exec: (query: string, ...args: Array<string | number | null>) => {
					const statement = sqlite.prepare(query);
					const rows = statement.columns().length ? statement.all(...args) : (statement.run(...args), []);
					return { toArray: () => rows, one: () => rows[0] };
				},
			},
		},
	} as unknown as DurableObjectState;
	const coordinator = new SeededSpendLimitDurableObject(state, {} as never);
	runtime.bindings = { SPEND_LIMITS: { getByName: () => coordinator }, GATEWAY_SPEND_LIMIT_DO_MODE: "enforce", MOBILE_PUSH_ENABLED: "false" };
	__resetSpendLimitsForTests();
}, 120_000);

afterAll(async () => {
	sqlite?.close();
	await db?.close();
});

describe("department holds from seed to guard", () => {
	it("seeds the coordinator with the department's finished spend plus its outstanding hold", () => {
		const seed = runtime.seed as { department_budgets: Array<{ usage_nanos: number; key_ids: string[] }> };
		expect(seed.department_budgets).toHaveLength(1);
		expect(Number(seed.department_budgets[0].usage_nanos)).toBe(11 * DOLLAR);
		expect(seed.department_budgets[0].key_ids).toEqual([LINKED_KEY, MEMBER_KEY]);
	});

	it("has the coordinator refuse the department's keys, so its decision cannot let the request through", async () => {
		const decision = await checkSpendLimit({ workspaceId: WORKSPACE, keyId: MEMBER_KEY, admissionId: "probe" });
		expect(decision).toMatchObject({
			outcome: "denied",
			keyLimit: { reason: "department_daily_cost_budget_reached", currentValue: 11 * DOLLAR, limitValue: 10 * DOLLAR, departmentId: DEPARTMENT },
		});
		expect(runtime.seedCalls.length).toBeGreaterThan(0);
	});

	it("refuses the request at the guard with the department named", async () => {
		const result = await guardContext({
			workspaceId: WORKSPACE, apiKeyId: MEMBER_KEY, endpoint: "responses" as any, capability: "text.generate",
			model: "openai/gpt-5.4-nano", requestId: "req-1", spendLimit: createSpendLimitSlot(),
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.response.status).toBe(429);
		expect(await result.response.json()).toMatchObject({
			code: "key_limit_exceeded",
			reason: "department_daily_cost_budget_reached",
			department_id: DEPARTMENT,
			department_name: "Engineering",
		});
	});
});
