import { createHmac } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// An OAuth app's opaque delegated token is a real gateway key (key_kind oauth_delegated): the real
// authenticate() resolves it to its key, and a department budget refuses it once used up, both in
// the spend-limit coordinator (real seed SQL) and in the request-context fallback (real SQL). The
// key row comes from the database the SQL runs on; only the Supabase client is a thin adapter.
const runtime = vi.hoisted(() => ({
	db: null as null | { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> },
	background: [] as Promise<unknown>[],
	coordinator: null as unknown,
	store: new Map<string, string>(),
}));

vi.mock("cloudflare:workers", () => ({
	DurableObject: class {
		constructor(public ctx: DurableObjectState, public env: unknown) {}
	},
}));
vi.mock("@core/tiered-cache", () => ({
	readLocationCache: async () => null,
	writeLocationCache: async () => undefined,
}));
vi.mock("@/runtime/env", async (importOriginal) => {
	const cache = {
		get: async (key: string, type?: string) => {
			const value = runtime.store.get(key);
			return value == null ? null : type === "json" ? JSON.parse(value) : value;
		},
		put: async (key: string, value: string) => { runtime.store.set(key, value); },
		delete: async (key: string) => { runtime.store.delete(key); },
	};
	const bindings = {
		SUPABASE_URL: "https://example.supabase.co",
		SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
		GATEWAY_CACHE: cache,
		KEY_PEPPER_ACTIVE: "pepper_test_value",
		SPEND_LIMITS: { getByName: () => runtime.coordinator },
		GATEWAY_SPEND_LIMIT_DO_MODE: "enforce",
	};
	// The tables auth reads, answered from the test database.
	const supabase = {
		from: (table: string) => {
			if (table === "keys") {
				return {
					select: () => ({ eq: (column: string, value: unknown) => ({
						maybeSingle: async () => ({ data: (await runtime.db!.query(`select * from public.keys where ${column} = $1`, [value])).rows[0] ?? null, error: null }),
					}) }),
					update: () => { const chain: any = { eq: () => chain, then: (resolve: (value: { error: null }) => unknown) => resolve({ error: null }) }; return chain; },
				};
			}
			if (table === "oauth_authorizations") {
				return {
					select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { scopes: ["gateway:access"], revoked_at: null }, error: null }) }) }) }) }),
					update: () => ({ eq: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }),
				};
			}
			if (table === "workspace_members") {
				return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { workspace_id: WORKSPACE }, error: null }) }) }) }) };
			}
			throw new Error(`Unexpected table: ${table}`);
		},
	};
	return {
		...(await importOriginal<typeof import("@/runtime/env")>()),
		getBindings: () => bindings,
		getBindingsIfConfigured: () => bindings,
		getCache: () => cache,
		getSupabaseAdmin: () => supabase,
		dispatchBackground: (promise: Promise<unknown>) => { runtime.background.push(promise.catch(() => undefined)); },
		configureRuntime: () => undefined,
		clearRuntime: () => undefined,
		ensureRuntimeForBackground: () => () => undefined,
	};
});

const WORKSPACE = "10000000-0000-4000-8000-000000000021";
const DELEGATED_KEY = "30000000-0000-4000-8000-000000000021";
const MEMBER = "20000000-0000-4000-8000-000000000021";
const DEPARTMENT = "40000000-0000-4000-8000-000000000021";
const KID = "KIDOAUTHDEPT";
const SECRET = "secret_oauth_department";
const DOLLAR = 1_000_000_000;

const { SpendLimitDurableObject } = await import("./spend-limit-durable-object");
const { __resetSpendLimitsForTests } = await import("./spend-limits");
const { authenticate } = await import("@pipeline/before/auth");

class SeededSpendLimitDurableObject extends SpendLimitDurableObject {
	protected override async loadSeed(workspaceId: string, keyIds: string[], exclude: string[]): Promise<any> {
		return (await runtime.db!.query("select public.gateway_spend_limit_seed($1, $2::uuid[], $3::text[], 2) as seed", [workspaceId, keyIds, exclude])).rows[0].seed;
	}
}
function startCoordinator() {
	const sqlite = new DatabaseSync(":memory:");
	const state = {
		blockConcurrencyWhile: (fn: () => Promise<unknown>) => fn(),
		storage: { sql: { exec: (query: string, ...args: Array<string | number | null>) => {
			const statement = sqlite.prepare(query);
			const rows = statement.columns().length ? statement.all(...args) : (statement.run(...args), []);
			return { toArray: () => rows, one: () => rows[0] };
		} } },
	} as unknown as DurableObjectState;
	runtime.coordinator = new SeededSpendLimitDurableObject(state, {} as never);
	__resetSpendLimitsForTests();
	return runtime.coordinator as InstanceType<typeof SeededSpendLimitDurableObject>;
}

beforeAll(async () => {
	const { PGlite } = await import("@electric-sql/pglite");
	const fixture = await import(/* @vite-ignore */ new URL("../../../../supabase/tests/fixtures/budget-enforcement-db.mjs", import.meta.url).href);
	const db = await fixture.createBudgetDatabase(PGlite);
	await fixture.applyMigration(db, await fixture.readMigration());
	runtime.db = db;
	const hash = createHmac("sha256", "pepper_test_value").update(SECRET).digest("hex");
	await db.exec(`
		alter table public.keys add column kid text, add column hash text, add column key_kind text, add column oauth_client_id text,
			add column oauth_scopes text[], add column oauth_resource text, add column name text;
		insert into public.workspaces (id) values ('${WORKSPACE}');
		insert into public.wallets (workspace_id, balance_nanos) values ('${WORKSPACE}', ${100 * DOLLAR});
		insert into public.workspace_departments (id, workspace_id, name) values ('${DEPARTMENT}', '${WORKSPACE}', 'Research');
		insert into public.workspace_department_grants (workspace_id, user_id, department_id) values ('${WORKSPACE}', '${MEMBER}', '${DEPARTMENT}');
		insert into public.workspace_department_budgets (workspace_id, department_id, interval, limit_nanos) values ('${WORKSPACE}', '${DEPARTMENT}', 'daily', ${10 * DOLLAR});
		-- The member's OAuth app holds an opaque delegated token: a key with no department link of its
		-- own, counted toward the member's department.
		insert into public.keys (id, workspace_id, status, kid, hash, key_kind, oauth_user_id, oauth_client_id, oauth_scopes)
			values ('${DELEGATED_KEY}', '${WORKSPACE}', 'active', '${KID}', '${hash}', 'oauth_delegated', '${MEMBER}', 'client_app', array['gateway:access']);
	`);
}, 120_000);

afterAll(async () => { await (runtime.db as any)?.close(); });

describe("department budgets and OAuth-delegated tokens", () => {
	it("refuse a delegated token's requests once the member's department budget is used up", async () => {
		const request = () => new Request("https://api.phaseo.app/v1/chat/completions", { method: "POST", headers: { authorization: `Bearer phaseo_v1_sk_${KID}_${SECRET}` } });
		const auth = await authenticate(request(), { useKvCache: false });
		expect(auth).toMatchObject({ ok: true, authMethod: "oauth", workspaceId: WORKSPACE, apiKeyId: DELEGATED_KEY });
		const keyId = (auth as { apiKeyId: string }).apiKeyId;

		const coordinatorDecision = async (admissionId: string) => {
			const coordinator = startCoordinator();
			const result = await coordinator.acquire(WORKSPACE, keyId, { requests: 1, units: 0 }, { requests: 1, units: 0 }, [], admissionId);
			return "denial" in result && result.denial ? result.denial.gate : { allowed: true };
		};
		const contextDecision = async () => (await runtime.db!.query(
			"select public.gateway_fetch_request_context($1, 'lab/model', 'responses', $2) as r", [WORKSPACE, keyId])).rows[0].r.key_limit_ok;

		// $9.50 of the department's $10 so far: still allowed.
		await runtime.db!.query(`insert into public.gateway_requests (workspace_id, request_id, key_id, success, cost_nanos) values ($1, 'oauth-1', $2, true, $3)`,
			[WORKSPACE, keyId, 9.5 * DOLLAR]);
		expect(await coordinatorDecision("a-1")).toEqual({ allowed: true });
		expect((await contextDecision()).ok).toBe(true);

		// The member's app spends the rest: the next request is refused by the department budget.
		await runtime.db!.query(`insert into public.gateway_requests (workspace_id, request_id, key_id, success, cost_nanos) values ($1, 'oauth-2', $2, true, $3)`,
			[WORKSPACE, keyId, DOLLAR]);
		expect(await coordinatorDecision("a-2")).toMatchObject({ reason: "department_daily_cost_budget_reached", departmentId: DEPARTMENT, currentValue: 10.5 * DOLLAR });
		expect(await contextDecision()).toMatchObject({ ok: false, reason: "department_daily_cost_budget_reached", department_id: DEPARTMENT });
	});
});
