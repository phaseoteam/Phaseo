import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The real seed SQL agrees with the coordinator's fake seed (spend-limits.test.ts) on charge rows:
// a charge with no audit row counts as cost but not as a successful request, toward key limits and
// toward a blocking spend guardrail counter over the key. Run through the real SpendLimitDurableObject.
const runtime = vi.hoisted(() => ({ bindings: null as Record<string, unknown> | null }));

vi.mock("cloudflare:workers", () => ({
	DurableObject: class {
		constructor(public ctx: DurableObjectState, public env: unknown) {}
	},
}));
vi.mock("@/runtime/env", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/runtime/env")>()),
	getBindingsIfConfigured: () => runtime.bindings,
	dispatchBackground: (promise: Promise<unknown>) => { promise.catch(() => undefined); },
}));

const { SpendLimitDurableObject } = await import("./spend-limit-durable-object");
const { __resetSpendLimitsForTests } = await import("./spend-limits");

const WORKSPACE = "10000000-0000-4000-8000-000000000041";
const A = "30000000-0000-4000-8000-000000000041";
const B = "30000000-0000-4000-8000-000000000042";
const GUARDRAIL = "50000000-0000-4000-8000-000000000041";
const DOLLAR = 1_000_000_000;

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>; exec: (sql: string) => Promise<unknown>; close: () => Promise<void> };
let db: Db;
const seeds: any[] = [];

class SeededSpendLimitDurableObject extends SpendLimitDurableObject {
	protected override async loadSeed(workspaceId: string, keyIds: string[], exclude: string[]): Promise<any> {
		await db.exec("set role service_role");
		try {
			const seed = (await db.query("select public.gateway_spend_limit_seed($1, $2::uuid[], $3::text[], 2) as seed", [workspaceId, keyIds, exclude])).rows[0].seed;
			seeds.push(seed);
			return seed;
		} finally {
			await db.exec("reset role");
		}
	}
}

let coordinator: SeededSpendLimitDurableObject;
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
	coordinator = new SeededSpendLimitDurableObject(state, {} as never);
	runtime.bindings = { SPEND_LIMITS: { getByName: () => coordinator }, GATEWAY_SPEND_LIMIT_DO_MODE: "enforce" };
	__resetSpendLimitsForTests();
}

let probes = 0;
async function decide(keyId: string) {
	const admissionId = `probe-${++probes}`;
	const result = await coordinator.acquire(WORKSPACE, keyId, { requests: 1, units: 0 }, { requests: 1, units: 0 }, [], admissionId);
	if ("denial" in result && result.denial) return result.denial.gate;
	if (result.lease.expiresAt) await coordinator.returnLeases(WORKSPACE, [{ id: result.lease.id, usedRequests: 0, usedUnits: 0, inFlightRequests: 0 }]);
	else await coordinator.release(WORKSPACE, result.lease.id, admissionId);
	return { allowed: true };
}

beforeAll(async () => {
	const { PGlite } = await import("@electric-sql/pglite");
	const fixture = await import(/* @vite-ignore */ new URL("../../../../supabase/tests/fixtures/budget-enforcement-db.mjs", import.meta.url).href);
	db = await fixture.createBudgetDatabase(PGlite);
	await fixture.applyMigration(db, await fixture.readMigration());
	await db.exec(`
		insert into public.workspaces (id) values ('${WORKSPACE}');
		insert into public.wallets (workspace_id, balance_nanos) values ('${WORKSPACE}', ${100 * DOLLAR});
		-- A allows one request a day; B is in a $4 shared guardrail with A.
		insert into public.keys (id, workspace_id, daily_limit_requests, daily_limit_cost_nanos) values
			('${A}', '${WORKSPACE}', 1, ${100 * DOLLAR}), ('${B}', '${WORKSPACE}', null, null);
		insert into public.workspace_guardrails (id, workspace_id, enabled, name, kind, spend_limit_nanos, spend_period, spend_action, spend_counting)
			values ('${GUARDRAIL}', '${WORKSPACE}', true, 'Team', 'spend', ${4 * DOLLAR}, 'daily', 'block', 'shared');
		create or replace function public.resolve_key_guardrails(p_workspace_id uuid, p_key_id uuid)
			returns table (guardrail_id uuid, source_type text, source_id uuid) language sql stable as $$
			select '${GUARDRAIL}'::uuid, 'workspace', null::uuid where p_key_id in ('${A}', '${B}') $$;
		-- A's $4.50 request was charged (a cancellation that kept its charge); its audit row never lands.
		insert into public.gateway_request_charges (workspace_id, request_id, cost_nanos, status, is_final, key_id)
			values ('${WORKSPACE}', 'bill-a', ${4.5 * DOLLAR}, 'applied', true, '${A}');
	`);
}, 120_000);

afterAll(async () => { await db?.close(); });

describe("the real seed on charge rows, through the spend-limit coordinator", () => {
	it("counts a charge as cost, not as a successful request, toward key limits and spend guardrails", async () => {
		startCoordinator();
		// Key limits are checked before guardrails: if the charge had used A's one request a day, A would
		// be refused for daily_request_limit_reached. It is refused by the guardrail it shares with B.
		expect(await decide(A)).toMatchObject({ reason: "guardrail_daily_spend_limit_reached", currentValue: 4.5 * DOLLAR });
		const seed = seeds.at(-1);
		expect(seed.keys.find((key: { key_id: string }) => key.key_id === A).used.daily).toEqual({ requests: 0, cost_nanos: 4.5 * DOLLAR });
		// The guardrail counter over A and B counts the charge, so B is refused.
		expect(seed.guardrail_budgets).toEqual([expect.objectContaining({ guardrail_id: GUARDRAIL, usage_nanos: 4.5 * DOLLAR })]);
		expect(await decide(B)).toMatchObject({ reason: "guardrail_daily_spend_limit_reached", currentValue: 4.5 * DOLLAR });
	});
});
