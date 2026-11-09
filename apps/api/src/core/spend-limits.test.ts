import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
	background: [] as Promise<unknown>[],
	bindings: null as Record<string, unknown> | null,
	readFootprint: (..._args: unknown[]): Promise<unknown> => Promise.reject(new Error("footprint read not expected")),
}));

vi.mock("cloudflare:workers", () => ({
	DurableObject: class {
		constructor(public ctx: DurableObjectState, public env: unknown) {}
	},
}));
vi.mock("@/runtime/env", () => ({
	dispatchBackground: (promise: Promise<unknown>) => { runtime.background.push(promise); },
	getBindingsIfConfigured: () => runtime.bindings,
}));
// spend-limit-footprint.test.ts covers the reads; here each test says what the read returns.
vi.mock("./spend-limit-footprint", async (importOriginal) => ({
	...(await importOriginal<typeof import("./spend-limit-footprint")>()),
	readSpendLimitFootprint: (...args: unknown[]) => runtime.readFootprint(...args),
}));

import { SpendLimitDurableObject, type SpendLimitSeed } from "./spend-limit-durable-object";
import { LeasePool, type LeaseTransport } from "./lease-pool";
import {
	__resetSpendLimitsForTests,
	checkSpendLimit,
	createSpendLimitSlot,
	ENFORCE_WAIT_MS,
	enforcedSpendLimit,
	flushSpendRecordsForTests,
	getSpendLimitMode,
	recordCheckpointSpend,
	recordShadowSpend,
	recordSpend,
	releaseSpend,
	settleEnforcedSpend,
	shadowSpendLimit,
	shadowSpendLimitOnce,
	slotAdmission,
	startSpendLimitFootprint,
} from "./spend-limits";
import type { SpendLimitFootprint } from "./spend-limit-footprint";
import { SPEND_LEASE, type SpendDenial, type SpendLeaseMeta } from "./spend-limits.shared";

const WORKSPACE = "workspace-1";
const KEY = "key-1";
const DAY = 86_400_000;

type Row = { requestId: string; keyId: string | null; success: boolean; cost: number; createdAt: number; billingId?: string };
type KeyConfig = { workspaceId: string; softBlocked?: boolean; daily?: [number, number]; weekly?: [number, number]; monthly?: [number, number] };
type Budget = { id: string; interval: "daily" | "weekly" | "monthly" | "lifetime"; limit: number; holds?: number };
type DepartmentBudget = { id: string; departmentId: string; name: string; interval: "daily" | "weekly" | "monthly"; limit: number; keyIds: string[] };
type GuardrailCounter = {
	guardrailId: string; name: string; counting: "shared" | "each_key"; counter: string;
	interval: "daily" | "weekly" | "monthly"; limit: number; keyIds: string[];
};

// A JavaScript model of gateway_spend_limit_seed (the PGlite contract test pins the SQL itself).
class FakeDatabase {
	rows: Row[] = [];
	keys = new Map<string, KeyConfig>();
	budgets: Budget[] = [];
	departments: DepartmentBudget[] = [];
	/** Blocking spend guardrail counters (private.spend_guardrail_usage with action block). */
	guardrails: GuardrailCounter[] = [];
	/** Seeds as written before department budgets could block (no department_budgets field). */
	legacyShape = false;
	calls: Array<{ keyIds: string[]; exclude: string[] }> = [];
	/**
	 * Debit movements of charges (one per checkpoint, final or refund), each at its own time: counted
	 * unless the charge's billing id is excluded, or an audit row records it (billingId), which then
	 * counts it once instead.
	 */
	charges: Array<{ billingId: string; keyId: string; total: number; at: number }> = [];

	chargeCost(keyIds: string[] | null, start: number | null, exclude: string[]): { cost: number; requests: number } {
		const now = Date.now();
		const audited = new Set(this.rows.filter((row) => row.billingId && row.success && row.createdAt <= now).map((row) => row.billingId));
		const rows = this.charges.filter((row) => (keyIds === null || keyIds.includes(row.keyId)) && !exclude.includes(row.billingId) &&
			!audited.has(row.billingId) && (start === null || row.at >= start) && row.at <= now);
		// Charges are spend, not successful requests: requests come from successful request rows only.
		return { cost: rows.reduce((sum, row) => sum + row.total, 0), requests: 0 };
	}
	fail = false;
	/** Holds every seed read until resolved (a stalled Postgres call). */
	stall: Promise<void> | null = null;
	/** Run just before and just after each seed read (things that happen while a seed loads). */
	beforeRead: (() => Promise<void>) | null = null;
	afterRead: (() => Promise<void>) | null = null;

	static windows(now: number) {
		const date = new Date(now);
		const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
		const week = day - ((new Date(day).getUTCDay() + 6) % 7) * DAY;
		const month = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
		return { daily: day, weekly: week, monthly: month };
	}

	usage(keyId: string, exclude: string[] = []) {
		const windows = FakeDatabase.windows(Date.now());
		const result = {} as Record<"daily" | "weekly" | "monthly", { requests: number; cost_nanos: number }>;
		for (const window of ["daily", "weekly", "monthly"] as const) {
			const rows = this.rows.filter((row) => row.keyId === keyId && row.success && row.createdAt >= windows[window] &&
				row.createdAt <= Date.now() && !exclude.includes(row.requestId));
			const charges = this.chargeCost([keyId], windows[window], exclude);
			result[window] = { requests: rows.length + charges.requests, cost_nanos: rows.reduce((sum, row) => sum + row.cost, 0) + charges.cost };
		}
		return result;
	}

	seed(workspaceId: string, keyIds: string[], exclude: string[]): SpendLimitSeed {
		this.calls.push({ keyIds: [...keyIds], exclude: [...exclude] });
		if (this.fail) throw new Error("database unavailable");
		// gateway_spend_limit_seed rejects more excluded ids than this.
		if (exclude.length > SPEND_LEASE.maxExcludedRequestIds) throw new Error("too_many_excluded_request_ids");
		const now = Date.now();
		const windows = FakeDatabase.windows(now);
		const iso = (ms: number) => new Date(ms).toISOString();
		const limit = (pair?: [number, number]) => ({ requests: pair?.[0] ?? null, cost_nanos: pair?.[1] ?? null });
		const keys = keyIds.flatMap((keyId) => {
			const key = this.keys.get(keyId);
			if (!key || key.workspaceId !== workspaceId) return [];
			const limited = [key.daily, key.weekly, key.monthly].some((pair) => pair && (pair[0] > 0 || pair[1] > 0));
			return [{
				key_id: keyId, active: true, soft_blocked: key.softBlocked === true, limited,
				limits: { daily: limit(key.daily), weekly: limit(key.weekly), monthly: limit(key.monthly) },
				used: limited ? this.usage(keyId, exclude) : null,
			}];
		});
		const budgets = this.budgets.map((budget) => {
			const start = budget.interval === "lifetime" ? null : windows[budget.interval];
			// Like the key buckets, less the spend the coordinator still counts from memory.
			const completed = this.rows.filter((row) => row.success && row.createdAt <= now && (start === null || row.createdAt >= start) &&
				!exclude.includes(row.requestId)).reduce((sum, row) => sum + row.cost, 0) + this.chargeCost(null, start, exclude).cost;
			const end = budget.interval === "daily" ? start! + DAY : budget.interval === "weekly" ? start! + 7 * DAY : null;
			return {
				id: budget.id, interval: budget.interval, limit_nanos: budget.limit, usage_nanos: completed + (budget.holds ?? 0),
				window_start: start === null ? null : iso(start), reset_at: end === null ? null : iso(end),
			};
		});
		const department_budgets = this.departments.map((budget) => {
			const start = windows[budget.interval];
			const usage = this.rows.filter((row) => row.keyId !== null && budget.keyIds.includes(row.keyId) && row.success &&
				row.createdAt >= start && row.createdAt <= now && !exclude.includes(row.requestId)).reduce((sum, row) => sum + row.cost, 0);
			const end = budget.interval === "daily" ? start + DAY : budget.interval === "weekly" ? start + 7 * DAY
				: Date.UTC(new Date(start).getUTCFullYear(), new Date(start).getUTCMonth() + 1, 1);
			return {
				id: budget.id, department_id: budget.departmentId, department_name: budget.name, interval: budget.interval,
				limit_nanos: budget.limit, usage_nanos: usage, window_start: iso(start), reset_at: iso(end), key_ids: [...budget.keyIds],
			};
		});
		const guardrail_budgets = this.guardrails.map((counter) => {
			const start = windows[counter.interval];
			const usage = this.rows.filter((row) => row.keyId !== null && counter.keyIds.includes(row.keyId) && row.success &&
				row.createdAt >= start && row.createdAt <= now && !exclude.includes(row.requestId)).reduce((sum, row) => sum + row.cost, 0) +
				this.chargeCost(counter.keyIds, start, exclude).cost;
			const end = counter.interval === "daily" ? start + DAY : counter.interval === "weekly" ? start + 7 * DAY
				: Date.UTC(new Date(start).getUTCFullYear(), new Date(start).getUTCMonth() + 1, 1);
			return {
				guardrail_id: counter.guardrailId, guardrail_name: counter.name, counting: counter.counting, counter: counter.counter,
				interval: counter.interval, limit_nanos: counter.limit, usage_nanos: usage, window_start: iso(start), reset_at: iso(end),
				key_ids: [...counter.keyIds],
			};
		});
		return {
			now: iso(now), day_start: iso(windows.daily), week_start: iso(windows.weekly), month_start: iso(windows.monthly),
			keys,
			budget_status: { ok: true, budgets },
			...(this.legacyShape ? {} : { department_budgets, guardrail_budgets }),
			excluded_rows: this.rows.filter((row) => exclude.includes(row.requestId))
				.map((row) => ({ request_id: row.requestId, key_id: row.keyId, success: row.success, cost_nanos: row.cost, created_at: iso(row.createdAt) })),
		};
	}
}

let sqlite: DatabaseSync;
let database: FakeDatabase;
let coordinator: SpendLimitDurableObject;

class TestSpendLimitDurableObject extends SpendLimitDurableObject {
	protected override async loadSeed(workspaceId: string, keyIds: string[], exclude: string[]): Promise<SpendLimitSeed> {
		await Promise.resolve();
		if (database.stall) await database.stall;
		if (database.beforeRead) await database.beforeRead();
		const seed = database.seed(workspaceId, keyIds, exclude);
		if (database.afterRead) await database.afterRead();
		return seed;
	}
}

function createCoordinator(): SpendLimitDurableObject {
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
	return new TestSpendLimitDurableObject(state, {} as never);
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

async function flush(): Promise<void> {
	for (let round = 0; round < 10; round++) {
		await flushSpendRecordsForTests();
		// Coordinator reseeds run on their own promise chain.
		await tick();
		const pending = runtime.background.splice(0);
		if (!pending.length) return;
		await Promise.all(pending.map((promise) => promise.catch(() => undefined)));
	}
}

/** Reads the coordinator's current buckets without leaving anything held. */
async function probe(keyId = KEY) {
	const id = `probe-${Math.random()}`;
	const result = await coordinator.acquire(WORKSPACE, keyId, { requests: 1, units: 0 }, { requests: 1, units: 0 }, [], id);
	if ("denial" in result) return result.denial?.gate.buckets ?? null;
	if (result.lease.expiresAt) await coordinator.returnLeases(WORKSPACE, [{ id: result.lease.id, usedRequests: 0, usedUnits: 0, inFlightRequests: 0 }]);
	else await coordinator.release(WORKSPACE, result.lease.id, id);
	return result.lease.meta.buckets;
}

/** An independent isolate: its own lease pool talking to the shared coordinator. */
function isolate(keyId = KEY) {
	const pool = new LeasePool<SpendLeaseMeta, SpendDenial>({ unitsMode: "precheck", background: (promise) => { runtime.background.push(promise); } });
	let sequence = 0;
	const transport: LeaseTransport<SpendLeaseMeta, SpendDenial> = {
		acquire: (need, want, returns) => coordinator.acquire(WORKSPACE, keyId, need, want, returns, `iso-${Math.random()}`),
		returnLeases: (returns) => coordinator.returnLeases(WORKSPACE, returns),
	};
	return {
		pool,
		transport,
		admit: () => pool.admit(`admission-${Math.random()}-${sequence++}`, { requests: 1, units: 0 }, transport),
		async succeed(ticket: { id: string; leaseId: string }, cost: number) {
			if (!pool.settle({ ...ticket, requests: 1 }, { requests: 0, units: cost })) pool.markSettled(ticket.id);
			await coordinator.record(WORKSPACE, { keyId, billingRequestId: ticket.id, requestId: ticket.id, costNanos: cost, requests: 1, leaseId: ticket.leaseId });
		},
		async fail(ticket: { id: string; leaseId: string }) {
			if (!pool.settle({ ...ticket, requests: 1 }, { requests: -1, units: 0 })) {
				pool.markSettled(ticket.id);
				await coordinator.release(WORKSPACE, ticket.leaseId, ticket.id);
			}
		},
	};
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
	sqlite = new DatabaseSync(":memory:");
	database = new FakeDatabase();
	database.keys.set(KEY, { workspaceId: WORKSPACE, daily: [100, 0], monthly: [0, 1_000_000] });
	coordinator = createCoordinator();
	runtime.background.length = 0;
	runtime.bindings = { SPEND_LIMITS: { getByName: (name: string) => {
		expect(name).toBe(`spend:${WORKSPACE}`);
		return coordinator;
	} }, GATEWAY_SPEND_LIMIT_DO_MODE: "shadow" };
	__resetSpendLimitsForTests();
});

afterEach(() => { sqlite.close(); vi.useRealTimers(); });

describe("spend-limit coordinator", () => {
	it("reads the mode flag with off as the default", () => {
		expect(getSpendLimitMode({ GATEWAY_SPEND_LIMIT_DO_MODE: "enforce" })).toBe("enforce");
		expect(getSpendLimitMode({ GATEWAY_SPEND_LIMIT_DO_MODE: " Shadow " })).toBe("shadow");
		expect(getSpendLimitMode({ GATEWAY_SPEND_LIMIT_DO_MODE: "on" })).toBe("off");
		expect(getSpendLimitMode({})).toBe("off");
	});

	it("asks the seed for contract version 2, so the SQL may leave out audit rows it still counts", async () => {
		// The real loadSeed, with the Supabase client replaced by a recorder.
		const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
		const real = new SpendLimitDurableObject({
			blockConcurrencyWhile: (fn: () => Promise<unknown>) => fn(),
			storage: { sql: { exec: (query: string, ...args: Array<string | number | null>) => {
				const statement = sqlite.prepare(query);
				const rows = statement.columns().length ? statement.all(...args) : (statement.run(...args), []);
				return { toArray: () => rows, one: () => rows[0] };
			} } },
		} as unknown as DurableObjectState, {} as never);
		(real as unknown as { supabase: unknown }).supabase = {
			rpc: async (fn: string, args: Record<string, unknown>) => {
				calls.push({ fn, args });
				return { data: database.seed(String(args.p_workspace_id), args.p_key_ids as string[], args.p_exclude_request_ids as string[]), error: null };
			},
		};
		await real.acquire(WORKSPACE, KEY, { requests: 1, units: 0 }, { requests: 1, units: 0 }, [], "contract");
		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({ fn: "gateway_spend_limit_seed", args: { p_workspace_id: WORKSPACE, p_key_ids: [KEY], p_contract_version: 2 } });
	});

	it("seeds lazily once and reports the same buckets as the database", async () => {
		database.rows.push(
			{ requestId: "old-1", keyId: KEY, success: true, cost: 400, createdAt: Date.parse("2026-10-09T01:00:00Z") },
			{ requestId: "old-2", keyId: KEY, success: false, cost: 900, createdAt: Date.parse("2026-10-09T02:00:00Z") },
			{ requestId: "old-3", keyId: KEY, success: true, cost: 50, createdAt: Date.parse("2026-10-02T02:00:00Z") },
		);
		const [first, second] = await Promise.all([
			checkSpendLimit({ workspaceId: WORKSPACE, keyId: KEY, admissionId: "a" }),
			checkSpendLimit({ workspaceId: WORKSPACE, keyId: KEY, admissionId: "b" }),
		]);
		expect(database.calls).toHaveLength(1);
		expect(first).toMatchObject({ outcome: "allowed", source: "coordinator" });
		expect(second).toMatchObject({ outcome: "allowed", source: "lease" });
		expect(first.keyLimit?.buckets).toEqual({
			daily: { windowStart: "2026-10-09T00:00:00.000Z", requestsUsed: 1, requestsLimit: 100, costUsedNanos: 400, costLimitNanos: 0 },
			weekly: { windowStart: "2026-10-05T00:00:00.000Z", requestsUsed: 1, requestsLimit: 0, costUsedNanos: 400, costLimitNanos: 0 },
			monthly: { windowStart: "2026-10-01T00:00:00.000Z", requestsUsed: 2, requestsLimit: 0, costUsedNanos: 450, costLimitNanos: 1_000_000 },
		});
	});

	it("admits from the held slice without awaiting the coordinator", async () => {
		await checkSpendLimit({ workspaceId: WORKSPACE, keyId: KEY, admissionId: "warm" });
		await flush();
		let settled = false;
		const acquire = vi.spyOn(coordinator, "acquire");
		const pending = checkSpendLimit({ workspaceId: WORKSPACE, keyId: KEY, admissionId: "hot" }).then((decision) => { settled = true; return decision; });
		for (let i = 0; i < 5; i++) await Promise.resolve();
		expect(settled).toBe(true);
		expect(await pending).toMatchObject({ outcome: "allowed", source: "lease", admission: { fromSlice: true } });
		expect(acquire).not.toHaveBeenCalled();
	});

	it("records spend idempotently on the billing request id", async () => {
		const decision = await checkSpendLimit({ workspaceId: WORKSPACE, keyId: KEY, admissionId: "req-1" });
		if (decision.outcome !== "allowed") throw new Error("expected admission");
		const record = { workspaceId: WORKSPACE, keyId: KEY, billingRequestId: "bill-1", requestId: "req-1", costNanos: 250, admission: decision.admission };
		recordSpend(record);
		recordSpend(record);
		await flush();
		expect(await coordinator.record(WORKSPACE, { keyId: KEY, billingRequestId: "bill-1", requestId: "req-1", costNanos: 250, requests: 1 }))
			.toEqual({ duplicates: 1, drainKeyIds: [] });
		const next = await checkSpendLimit({ workspaceId: WORKSPACE, keyId: KEY, admissionId: "req-2" });
		expect(next.keyLimit?.buckets?.daily).toMatchObject({ requestsUsed: 1, costUsedNanos: 250 });
	});

	it("keeps the latest checkpoint and the final settlement of a stepped charge, in any delivery order", async () => {
		const used = async () => (await probe())?.daily;
		const entry = { keyId: KEY, billingRequestId: "bill-stepped", requestId: "req-stepped", requests: 1, replace: true };
		await checkSpendLimit({ workspaceId: WORKSPACE, keyId: KEY, admissionId: "warm" });
		// Checkpoints report the charged total so far; the drain may be stopped before it settles.
		await coordinator.record(WORKSPACE, { ...entry, costNanos: 100, revision: 1 });
		expect(await used()).toMatchObject({ requestsUsed: 1, costUsedNanos: 100 });
		await coordinator.record(WORKSPACE, { ...entry, costNanos: 250, revision: 2 });
		expect(await used()).toMatchObject({ requestsUsed: 1, costUsedNanos: 250 });
		// A replay, or checkpoint 1 delivered late, changes nothing.
		expect(await coordinator.record(WORKSPACE, { ...entry, costNanos: 250, revision: 2 })).toMatchObject({ duplicates: 1 });
		expect(await coordinator.record(WORKSPACE, { ...entry, costNanos: 100, revision: 1 })).toMatchObject({ duplicates: 1 });
		expect(await used()).toMatchObject({ costUsedNanos: 250 });
		// The final settlement (a refund to 0 here) replaces the checkpoints instead of adding to them.
		await coordinator.record(WORKSPACE, { ...entry, costNanos: 0, final: true });
		expect(await used()).toMatchObject({ requestsUsed: 1, costUsedNanos: 0 });
		// A checkpoint delayed past the final, a replayed final, or a plain record never replace it.
		expect(await coordinator.record(WORKSPACE, { ...entry, costNanos: 600, revision: 3 })).toMatchObject({ duplicates: 1 });
		expect(await coordinator.record(WORKSPACE, { ...entry, costNanos: 0, final: true })).toMatchObject({ duplicates: 1 });
		expect(await coordinator.record(WORKSPACE, { ...entry, replace: undefined, costNanos: 900 })).toMatchObject({ duplicates: 1 });
		expect(await used()).toMatchObject({ costUsedNanos: 0 });
	});

	describe("stepped charges as ordinary entries", () => {
		const entry = (billingRequestId: string) => ({ keyId: KEY, billingRequestId, requestId: `req-${billingRequestId}`, requests: 1, replace: true });
		const daily = async () => (await probe())?.daily?.costUsedNanos;
		const reseed = async () => {
			vi.setSystemTime(Date.now() + SPEND_LEASE.reseedMs + 1);
			await probe();
			await flush();
		};
		// The checkpoint debit commits the charge row before the coordinator hears of it.
		// The debit of the increase, at its own time, then the report of the running total.
		const charged = (billingRequestId: string) => database.charges
			.filter((charge) => charge.billingId === billingRequestId).reduce((sum, charge) => sum + charge.total, 0);
		const debit = (billingRequestId: string, total: number) => {
			const delta = total - charged(billingRequestId);
			if (delta !== 0) database.charges.push({ billingId: billingRequestId, keyId: KEY, total: delta, at: Date.now() });
		};
		const checkpoint = (billingRequestId: string, total: number, revision: number) => {
			debit(billingRequestId, total);
			return coordinator.record(WORKSPACE, { ...entry(billingRequestId), costNanos: total, revision });
		};
		const buckets = async () => {
			const value = await probe();
			return { daily: value?.daily?.costUsedNanos, weekly: value?.weekly?.costUsedNanos, monthly: value?.monthly?.costUsedNanos };
		};
		beforeEach(async () => {
			await checkSpendLimit({ workspaceId: WORKSPACE, keyId: KEY, admissionId: "warm" });
			await flush();
		});

		it("raises the entry with each checkpoint and never lowers it", async () => {
			await checkpoint("b-raise", 100, 1);
			expect(await daily()).toBe(100);
			await checkpoint("b-raise", 300, 2);
			expect(await daily()).toBe(300);
			// A reordered, lower checkpoint changes nothing.
			expect(await coordinator.record(WORKSPACE, { ...entry("b-raise"), costNanos: 250, revision: 3 })).toMatchObject({ duplicates: 1 });
			expect(await daily()).toBe(300);
		});

		it("lets the final lower it, then ignores late checkpoints", async () => {
			await checkpoint("b-final", 300, 1);
			await coordinator.record(WORKSPACE, { ...entry("b-final"), costNanos: 50, final: true });
			expect(await daily()).toBe(50);
			expect(await coordinator.record(WORKSPACE, { ...entry("b-final"), costNanos: 600, revision: 2 })).toMatchObject({ duplicates: 1 });
			expect(await coordinator.record(WORKSPACE, { ...entry("b-final"), costNanos: 0, final: true })).toMatchObject({ duplicates: 1 });
			expect(await daily()).toBe(50);
		});

		it("excludes both its request and billing ids while it is held, so the seed does not count it twice", async () => {
			await checkpoint("b-excl", 300, 1);
			await reseed();
			expect(database.calls.at(-1)?.exclude.sort()).toEqual(["b-excl", "req-b-excl"]);
			expect(await daily()).toBe(300);
		});

		it("ends with the same total after it expires and the seed counts the charge row", async () => {
			await checkpoint("b-expire", 300, 1);
			await reseed();
			expect(await daily()).toBe(300);
			vi.setSystemTime(Date.now() + SPEND_LEASE.pendingTtlMs + 1);
			// The very next seed after expiry no longer excludes it, so it counts the charge row.
			await reseed();
			expect(database.calls.at(-1)?.exclude).toEqual([]);
			expect(await daily()).toBe(300);
			// A late checkpoint debits $1 more after the handoff. The seed in use predates that debit,
			// so the increase over the handed-off $3 counts from memory at once ...
			expect(await checkpoint("b-expire", 400, 2)).toMatchObject({ duplicates: 0 });
			expect(await daily()).toBe(400);
			// ... until a seed read after it counts the charge row's $4 itself, exactly.
			await reseed();
			expect(await daily()).toBe(400);
			await reseed();
			expect(database.calls.at(-1)?.exclude).toEqual([]);
			expect(await daily()).toBe(400);
			// A lower late total (a refund, already in the ledger) adds nothing.
			expect(await coordinator.record(WORKSPACE, { ...entry("b-expire"), costNanos: 350, revision: 3 })).toMatchObject({ duplicates: 1 });
		});

		it("keeps a never-audited stepped request counted after its entry expires, final refund included", async () => {
			// The seed counts charges without an audit row from their ledger movements (#3547), so
			// retiring the entry hands its spend to the database instead of losing it.
			await checkpoint("b-unaudited", 300, 1);
			await reseed();
			expect(await daily()).toBe(300);
			vi.setSystemTime(Date.now() + SPEND_LEASE.pendingTtlMs + 1);
			await reseed();
			expect(database.calls.at(-1)?.exclude).toEqual([]);
			expect(await daily()).toBe(300);
			// The final refunds to $1. The coordinator ignores its record (the id was seen), but the
			// refund is a ledger movement, and the next seed counts it.
			debit("b-unaudited", 100);
			expect(await coordinator.record(WORKSPACE, { ...entry("b-unaudited"), costNanos: 100, final: true })).toMatchObject({ duplicates: 1 });
			await reseed();
			expect(await daily()).toBe(100);
		});

		it("is dropped by a restart; the seed counts the charge row until a later record opens it again", async () => {
			await checkpoint("b-restart", 300, 1);
			coordinator = createCoordinator();
			await reseed();
			expect(database.calls.at(-1)?.exclude).toEqual([]);
			expect(await daily()).toBe(300);
			// Checkpoint 2 reopens it: counted from memory once a seed excludes the charge row, never twice.
			await checkpoint("b-restart", 500, 2);
			await flush();
			expect(await daily()).toBe(500);
			debit("b-restart", 0);
			await coordinator.record(WORKSPACE, { ...entry("b-restart"), costNanos: 0, final: true });
			expect(await daily()).toBe(0);
			await reseed();
			expect(await daily()).toBe(0);
		});

		it.each([
			["a daily boundary (Friday to Saturday)", "2026-10-09T23:58:00Z", "2026-10-10T00:01:00Z", { daily: 50, weekly: 150, monthly: 150 }],
			["a weekly boundary (Sunday to Monday)", "2026-10-11T23:58:00Z", "2026-10-12T00:01:00Z", { daily: 50, weekly: 50, monthly: 150 }],
			["a monthly boundary (31 October to 1 November)", "2026-10-31T23:58:00Z", "2026-11-01T00:01:00Z", { daily: 50, weekly: 150, monthly: 50 }],
		])("retires an entry held across %s, so each debit counts in its own period", async (_label, before, after, expected) => {
			database.keys.set(KEY, { workspaceId: WORKSPACE, daily: [100, 1_000_000], weekly: [0, 1_000_000], monthly: [0, 1_000_000] });
			vi.setSystemTime(new Date(before));
			await reseed();
			await checkpoint("b-roll", 100, 1);
			expect(await buckets()).toEqual({ daily: 100, weekly: 100, monthly: 100 });
			// Past midnight: checkpoint 2 debits $50 more while the coordinator still holds the entry.
			vi.setSystemTime(new Date(after));
			await checkpoint("b-roll", 150, 2);
			await reseed();
			expect(database.calls.at(-1)?.exclude).toEqual([]);
			expect(await buckets()).toEqual(expected);
			// A late checkpoint debits $0.50 more in the new period. Its increase counts at once in every
			// window, then the next seed counts the debit itself: $0.50 more in each window, exactly.
			const later = { daily: expected.daily + 50, weekly: expected.weekly + 50, monthly: expected.monthly + 50 };
			expect(await checkpoint("b-roll", 200, 3)).toMatchObject({ duplicates: 0 });
			expect(await buckets()).toEqual(later);
			await reseed();
			await reseed();
			expect(await buckets()).toEqual(later);
		});

		describe("an entry that goes stale while a seed is loading", () => {
			// The seed starts while the entry is held (so it excludes the entry's charge row) and is
			// still loading when the entry passes midnight or its pending TTL.
			// The seed helper moves the clock a minute on: the entry opens at 23:58:00 and 12:01:00.
			const scenarios = [
				{
					// A checkpoint after midnight debits $50 more while the seed is still loading.
					label: "a stepped entry held past midnight", laterTotal: 150,
					start: "2026-10-09T23:57:00Z", seedAt: "2026-10-09T23:59:01Z", loadedAt: "2026-10-10T00:01:00Z",
					expected: { daily: 50, weekly: 150, monthly: 150 }, lifetime: 150,
				},
				{
					label: "a stepped entry past its pending TTL", laterTotal: null,
					start: "2026-10-09T12:00:00Z", seedAt: "2026-10-09T12:14:30Z", loadedAt: "2026-10-09T12:16:30Z",
					expected: { daily: 100, weekly: 100, monthly: 100 }, lifetime: 100,
				},
			];
			const stalledSeed = async (scenario: (typeof scenarios)[number]) => {
				vi.setSystemTime(new Date(scenario.start));
				await reseed();
				await checkpoint("b-stall", 100, 1);
				// A background reseed starts with the entry held, then stalls in Postgres.
				let unstall!: () => void;
				database.stall = new Promise((resolve) => { unstall = resolve; });
				vi.setSystemTime(new Date(scenario.seedAt));
				const calls = database.calls.length;
				void probe();
				await flush();
				vi.setSystemTime(new Date(scenario.loadedAt));
				if (scenario.laterTotal !== null) await checkpoint("b-stall", scenario.laterTotal, 2);
				database.stall = null;
				unstall();
				await flush();
				expect(database.calls[calls]?.exclude.sort()).toEqual(["b-stall", "req-b-stall"]);
			};

			it.each(scenarios)("keeps the spend of $label", async (scenario) => {
				database.keys.set(KEY, { workspaceId: WORKSPACE, daily: [100, 1_000_000], weekly: [0, 1_000_000], monthly: [0, 1_000_000] });
				await stalledSeed(scenario);
				expect(await buckets()).toEqual(scenario.expected);
			});

			it.each(scenarios)("keeps the lifetime budget spend of $label", async (scenario) => {
				// Reached exactly at the request's total, so the coordinator reports the usage it counts.
				database.budgets.push({ id: "lifetime", interval: "lifetime", limit: scenario.lifetime });
				await stalledSeed(scenario);
				const result = await coordinator.acquire(WORKSPACE, KEY, { requests: 1, units: 0 }, { requests: 1, units: 0 }, [], "lifetime-probe");
				expect("denial" in result ? result.denial?.gate : null).toMatchObject({
					reason: "workspace_lifetime_cost_budget_reached", currentValue: scenario.lifetime,
				});
			});
		});

		it("ends at the money moved when a refund commits after the audit read back the old total", async () => {
			await checkpoint("b-late", 500, 1);
			// The final refund to 300 fails as far as the gateway can tell; the read-back still sees 500,
			// so the failure audit settles the entry at max(500 confirmed, 300 expected).
			await coordinator.record(WORKSPACE, { ...entry("b-late"), costNanos: 500, final: true });
			expect(await daily()).toBe(500);
			// The refund commits afterwards, and the pending row lands with its frozen 500.
			debit("b-late", 300);
			database.rows.push({ requestId: "req-b-late", keyId: KEY, success: false, cost: 500, createdAt: Date.now() });
			await reseed();
			await reseed();
			// The seed counts a pending request by its money movements, not by the row's cost.
			expect(database.calls.at(-1)?.exclude).toEqual([]);
			expect(await daily()).toBe(300);
		});

		it("keeps counting an entry whose audit row landed until a seed counts its money movements", async () => {
			database.budgets.push({ id: "lifetime", interval: "lifetime", limit: 300 });
			await checkpoint("b-hand", 300, 1);
			// The audit lands as a pending failure row: the seed counts the request by its charge
			// movements, never the row's cost (the money-movements rule), so the row adds nothing.
			database.rows.push({ requestId: "req-b-hand", keyId: KEY, success: false, cost: 300, createdAt: Date.now() });
			const denied = async () => {
				const result = await coordinator.acquire(WORKSPACE, KEY, { requests: 1, units: 0 }, { requests: 1, units: 0 }, [], `p-${Math.random()}`);
				return "denial" in result ? result.denial?.gate : null;
			};
			// This seed excludes both its ids and finds its row: the entry is marked persisted, but the
			// seed does not count its spend, so memory still must.
			await reseed();
			expect(database.calls.at(-1)?.exclude.sort()).toEqual(["b-hand", "req-b-hand"]);
			expect(await denied()).toMatchObject({ reason: "workspace_lifetime_cost_budget_reached", currentValue: 300 });
			// The next seed no longer excludes it and counts the charge row: handed off, still 300.
			await reseed();
			expect(database.calls.at(-1)?.exclude).toEqual([]);
			expect(await denied()).toMatchObject({ reason: "workspace_lifetime_cost_budget_reached", currentValue: 300 });
		});

		it("reloads a seed rather than count twice a request recorded while it loaded", async () => {
			database.keys.set(KEY, { workspaceId: WORKSPACE, daily: [100, 1_000] });
			await reseed();
			let unstall!: () => void;
			database.stall = new Promise((resolve) => { unstall = resolve; });
			vi.setSystemTime(Date.now() + SPEND_LEASE.reseedMs + 1);
			void probe();
			await flush();
			// While the seed is loading, a $6 request's audit row lands and then its spend is recorded.
			database.rows.push({ requestId: "req-loaded", keyId: KEY, success: true, cost: 600, createdAt: Date.now() });
			await coordinator.record(WORKSPACE, { keyId: KEY, billingRequestId: "bill-loaded", requestId: "req-loaded", costNanos: 600, requests: 1 });
			database.stall = null;
			unstall();
			await flush();
			// Counted once ($6), not by both the seed's row and memory ($12).
			expect(database.calls.at(-1)?.exclude.sort()).toEqual(["bill-loaded", "req-loaded"]);
			expect((await probe())?.daily).toMatchObject({ requestsUsed: 1, costUsedNanos: 600 });
		});

		it("counts an ordinary request once while held, when its audit lands and after the seed takes it over", async () => {
			// The fake-seed version of #3547's real-SQL handoff test: the charge row lands first under
			// the billing id, then the coordinator records the $4.50 request.
			const ordinary = { keyId: KEY, billingRequestId: "bill-ordinary", requestId: "req-ordinary", costNanos: 450, requests: 1 };
			database.charges.push({ billingId: "bill-ordinary", keyId: KEY, total: 450, at: Date.now() });
			await coordinator.record(WORKSPACE, ordinary);
			expect(await daily()).toBe(450);
			// A seed while it is held excludes both ids, so the charge row is not counted as well.
			await reseed();
			expect(await daily()).toBe(450);
			expect(database.calls.at(-1)?.exclude.sort()).toEqual(["bill-ordinary", "req-ordinary"]);
			// The audit row lands: the next seed still excludes it and finds the row.
			database.rows.push({ requestId: "req-ordinary", billingId: "bill-ordinary", keyId: KEY, success: true, cost: 450, createdAt: Date.now() });
			await reseed();
			expect(await daily()).toBe(450);
			// The seed after that counts the row (the charge row once, through it); the held copy goes.
			await reseed();
			expect(database.calls.at(-1)?.exclude).toEqual([]);
			expect(await daily()).toBe(450);
			coordinator = createCoordinator();
			expect(await daily()).toBe(450);
		});

		it("reseeds once the held entries' ids, two per request, reach the seed's limit", async () => {
			const calls = database.calls.length;
			// 2,600 requests need 5,200 ids, above the 5,000 the seed accepts.
			for (let batch = 0; batch < 26; batch += 1) {
				await coordinator.record(WORKSPACE, Array.from({ length: 100 }, (_, index) => {
					const n = batch * 100 + index;
					return { keyId: KEY, billingRequestId: `bill-burst-${n}`, requestId: `req-burst-${n}`, costNanos: 1, requests: 1 };
				}));
			}
			await flush();
			// A reseed started on its own, and no seed was sent more ids than it accepts.
			expect(database.calls.length).toBeGreaterThan(calls);
			expect(Math.max(...database.calls.slice(calls).map((call) => call.exclude.length))).toBeLessThanOrEqual(SPEND_LEASE.maxExcludedRequestIds);
			expect(database.calls.at(-1)?.exclude).toHaveLength(SPEND_LEASE.maxExcludedRequestIds);
		});

		it("counts a late checkpoint's whole total when the handed-off amount was forgotten, then exactly", async () => {
			const internals = coordinator as unknown as { handedOff: Map<string, unknown>; rememberHandoff(entry: unknown): void };
			await checkpoint("b-forgot", 300, 1);
			vi.setSystemTime(Date.now() + SPEND_LEASE.pendingTtlMs + 1);
			await reseed();
			expect(internals.handedOff.has("b-forgot")).toBe(true);
			// Forgotten (the record is bounded): the late total counts whole, over the seed's $3 ...
			internals.handedOff.delete("b-forgot");
			await checkpoint("b-forgot", 400, 2);
			expect(await daily()).toBe(700);
			// ... until seeds read after it count the charge row alone.
			await reseed();
			await reseed();
			expect(await daily()).toBe(400);
			// The record of handed-off totals stays bounded, oldest forgotten first.
			for (let n = 0; n < 10_005; n += 1) internals.rememberHandoff({ billingRequestId: `h-${n}`, keyId: KEY, cost: 1 });
			expect(internals.handedOff.size).toBe(10_000);
			expect(internals.handedOff.has("h-0")).toBe(false);
		});

		it("ignores a first checkpoint that arrives after the request's final", async () => {
			// The stream was refunded to 0 at its final; delivery put the final first.
			debit("b-reordered", 300);
			debit("b-reordered", 0);
			// The final opens the entry, set at 0; the late checkpoint cannot raise a final entry.
			expect(await coordinator.record(WORKSPACE, { ...entry("b-reordered"), costNanos: 0, final: true })).toMatchObject({ duplicates: 0 });
			expect(await coordinator.record(WORKSPACE, { ...entry("b-reordered"), costNanos: 300, revision: 1 })).toMatchObject({ duplicates: 1 });
			await flush();
			expect(await daily()).toBe(0);
			await reseed();
			expect(await daily()).toBe(0);
		});

		it("counts a request whose first checkpoint never arrived, once", async () => {
			// Checkpoint 1 debited $100 but its record was lost; the seed already counts the charge row.
			debit("b-lost", 100);
			await reseed();
			expect(await daily()).toBe(100);
			// Checkpoint 2 opens the entry and counts from memory at once. Until the seed that excludes
			// the charge row is published (started at once) the $100 the seed counts is counted twice:
			// a brief over-count ($350), never an under-count.
			let unstall!: () => void;
			database.stall = new Promise((resolve) => { unstall = resolve; });
			await checkpoint("b-lost", 250, 2);
			expect(await daily()).toBe(350);
			database.stall = null;
			unstall();
			await flush();
			expect(database.calls.at(-1)?.exclude.sort()).toEqual(["b-lost", "req-b-lost"]);
			expect(await daily()).toBe(250);
			debit("b-lost", 200);
			await coordinator.record(WORKSPACE, { ...entry("b-lost"), costNanos: 200, final: true });
			expect(await daily()).toBe(200);
			await reseed();
			expect(await daily()).toBe(200);
		});

		it("counts a final for a request it never held (every checkpoint record lost, or a one-off charge)", async () => {
			debit("b-final-only", 300);
			await coordinator.record(WORKSPACE, { ...entry("b-final-only"), costNanos: 300, final: true });
			await flush();
			expect(database.calls.at(-1)?.exclude.sort()).toEqual(["b-final-only", "req-b-final-only"]);
			expect(await daily()).toBe(300);
			// Later records for it change nothing.
			expect(await coordinator.record(WORKSPACE, { ...entry("b-final-only"), costNanos: 900, revision: 3 })).toMatchObject({ duplicates: 1 });
			await reseed();
			expect(await daily()).toBe(300);
		});
	});

	it("applies a checkpoint to the isolate's cached slice, so the next request near the cap is refused", async () => {
		runtime.bindings = { ...runtime.bindings!, GATEWAY_SPEND_LIMIT_DO_MODE: "enforce" };
		const key = "00000000-0000-4000-8000-000000000002";
		database.keys.set(key, { workspaceId: WORKSPACE, daily: [0, 1_000] });
		const first = await checkSpendLimit({ workspaceId: WORKSPACE, keyId: key, admissionId: "req-a" });
		if (first.outcome !== "allowed") throw new Error("expected admission");
		const args = { admission: first.admission, workspaceId: WORKSPACE, keyId: key, billingRequestId: "bill-a", requestId: "req-a" };
		recordCheckpointSpend({ ...args, costNanos: 1_100, revision: 1 });
		await flush();
		expect((await checkSpendLimit({ workspaceId: WORKSPACE, keyId: key, admissionId: "req-b" })).outcome).toBe("denied");
		// The final settlement replaces the checkpoint units on the slice instead of adding to them.
		settleEnforcedSpend({ ...args, rowWritten: true, costNanos: 1_100, replace: true });
		await flush();
		expect((await probe(key))?.daily).toMatchObject({ costUsedNanos: 1_100 });
		expect((await checkSpendLimit({ workspaceId: WORKSPACE, keyId: key, admissionId: "req-c" })).outcome).toBe("denied");
	});

	it("counts a charged cancellation's cost but not a successful request, and frees its request slot", async () => {
		runtime.bindings = { ...runtime.bindings!, GATEWAY_SPEND_LIMIT_DO_MODE: "enforce" };
		const key = "00000000-0000-4000-8000-000000000004";
		// One request a day.
		database.keys.set(key, { workspaceId: WORKSPACE, daily: [1, 1_000] });
		const first = await checkSpendLimit({ workspaceId: WORKSPACE, keyId: key, admissionId: "req-cancel" });
		if (first.outcome !== "allowed") throw new Error("expected admission");
		// The client left; the request kept a $3 charge and its failure row was written.
		settleEnforcedSpend({ admission: first.admission, rowWritten: true, workspaceId: WORKSPACE, keyId: key,
			billingRequestId: "bill-cancel", requestId: "req-cancel", costNanos: 300, requests: 0 });
		await flush();
		expect((await probe(key))?.daily).toMatchObject({ requestsUsed: 0, costUsedNanos: 300 });
		expect((await checkSpendLimit({ workspaceId: WORKSPACE, keyId: key, admissionId: "req-next" })).outcome).toBe("allowed");
	});

	it("gives back a stepped request's slot when its final refunds it to 0 as a failure", async () => {
		runtime.bindings = { ...runtime.bindings!, GATEWAY_SPEND_LIMIT_DO_MODE: "enforce" };
		const key = "00000000-0000-4000-8000-000000000005";
		database.keys.set(key, { workspaceId: WORKSPACE, daily: [1, 1_000] });
		const first = await checkSpendLimit({ workspaceId: WORKSPACE, keyId: key, admissionId: "req-fail" });
		if (first.outcome !== "allowed") throw new Error("expected admission");
		const args = { admission: first.admission, workspaceId: WORKSPACE, keyId: key, billingRequestId: "bill-fail", requestId: "req-fail" };
		recordCheckpointSpend({ ...args, costNanos: 300, revision: 1 });
		await flush();
		settleEnforcedSpend({ ...args, rowWritten: true, costNanos: 0, replace: true, requests: 0 });
		await flush();
		expect((await probe(key))?.daily).toMatchObject({ requestsUsed: 0, costUsedNanos: 0 });
		expect((await checkSpendLimit({ workspaceId: WORKSPACE, keyId: key, admissionId: "req-after" })).outcome).toBe("allowed");
	});

	it("frees the slice again when a checkpointed request is refunded to 0", async () => {
		runtime.bindings = { ...runtime.bindings!, GATEWAY_SPEND_LIMIT_DO_MODE: "enforce" };
		const key = "00000000-0000-4000-8000-000000000003";
		database.keys.set(key, { workspaceId: WORKSPACE, daily: [0, 1_000] });
		const first = await checkSpendLimit({ workspaceId: WORKSPACE, keyId: key, admissionId: "req-a" });
		if (first.outcome !== "allowed") throw new Error("expected admission");
		const args = { admission: first.admission, workspaceId: WORKSPACE, keyId: key, billingRequestId: "bill-r", requestId: "req-a" };
		recordCheckpointSpend({ ...args, costNanos: 1_100, revision: 1 });
		await flush();
		settleEnforcedSpend({ ...args, rowWritten: false, costNanos: 0, replace: true });
		await flush();
		expect((await probe(key))?.daily).toMatchObject({ costUsedNanos: 0 });
		expect((await checkSpendLimit({ workspaceId: WORKSPACE, keyId: key, admissionId: "req-d" })).outcome).toBe("allowed");
	});

	it("records checkpoint spend in enforce mode without settling the admission", async () => {
		runtime.bindings = { ...runtime.bindings!, GATEWAY_SPEND_LIMIT_DO_MODE: "enforce" };
		const key = "00000000-0000-4000-8000-000000000001";
		database.keys.set(key, { workspaceId: WORKSPACE, daily: [0, 1_000] });
		const decision = await checkSpendLimit({ workspaceId: WORKSPACE, keyId: key, admissionId: "req-ckpt" });
		if (decision.outcome !== "allowed") throw new Error("expected admission");
		const record = vi.spyOn(coordinator, "record");
		const args = { admission: decision.admission, workspaceId: WORKSPACE, keyId: key, billingRequestId: "bill-ckpt", requestId: "req-ckpt" };
		recordCheckpointSpend({ ...args, costNanos: 600, revision: 1 });
		await flush();
		expect(record).toHaveBeenLastCalledWith(WORKSPACE, [expect.objectContaining({ billingRequestId: "bill-ckpt", costNanos: 600, replace: true })]);
		// The drain is stopped here: the coordinator still holds the 600 for this key's budget.
		expect((await probe(key))?.daily).toMatchObject({ costUsedNanos: 600 });
		// When it does settle, the final amount replaces the checkpoint's.
		settleEnforcedSpend({ ...args, rowWritten: false, costNanos: 350, replace: true });
		await flush();
		expect((await probe(key))?.daily).toMatchObject({ costUsedNanos: 350 });
	});

	it("never grants more requests than remain, across isolates and failures", async () => {
		database.rows.push(...Array.from({ length: 37 }, (_, index) => ({
			requestId: `seeded-${index}`, keyId: KEY, success: true, cost: 1, createdAt: Date.parse("2026-10-09T03:00:00Z"),
		})));
		const isolates = Array.from({ length: 5 }, () => isolate());
		let allowed = 0, failed = 0;
		const inFlight: Array<Promise<void>> = [];
		for (let i = 0; i < 400; i++) {
			const node = isolates[i % isolates.length];
			inFlight.push(node.admit().then(async (result) => {
				if (!("ticket" in result)) return;
				allowed++;
				await Promise.resolve();
				if (i % 9 === 0) { failed++; await node.fail(result.ticket); } else await node.succeed(result.ticket, 3);
			}));
			if (i % 20 === 0) await flush();
		}
		await Promise.all(inFlight);
		await flush();
		const succeeded = allowed - failed;
		expect(37 + succeeded).toBeLessThanOrEqual(100);
		// Slices still held by isolates are the only unused allowance; once returned, the rest is admissible.
		for (const node of isolates) await coordinator.returnLeases(WORKSPACE, node.pool.drain());
		const late = isolate();
		let extra = 0;
		for (let i = 0; i < 100; i++) {
			const result = await late.admit();
			if (!("ticket" in result)) {
				expect(result.denial.gate).toMatchObject({ ok: false, reason: "daily_request_limit_reached", limitWindow: "daily", limitMetric: "requests", limitValue: 100 });
				break;
			}
			extra++;
			await late.succeed(result.ticket, 3);
		}
		expect(37 + succeeded + extra).toBe(100);
	});

	it("admits cost-capped requests exactly while recorded spend is below the limit", async () => {
		database.keys.set(KEY, { workspaceId: WORKSPACE, daily: [0, 1_000] });
		const node = isolate();
		let allowed = 0;
		let denial: SpendDenial | null = null;
		for (let i = 0; i < 200 && !denial; i++) {
			const result = await node.admit();
			if ("denial" in result) { denial = result.denial; break; }
			allowed++;
			await node.succeed(result.ticket, 7);
			await flush();
		}
		// Same rule as the context check: admit while used < limit; 142 * 7 = 994, 143 * 7 = 1001.
		expect(allowed).toBe(143);
		expect(denial?.gate).toMatchObject({ reason: "daily_cost_limit_reached", currentValue: 1001, limitValue: 1_000, limitMetric: "cost" });
		expect(denial?.contended).toBe(false);
	});

	it("does not double count recorded spend when reseeding, and picks up rows from other paths", async () => {
		const first = await checkSpendLimit({ workspaceId: WORKSPACE, keyId: KEY, admissionId: "r1" });
		if (first.outcome !== "allowed") throw new Error("expected admission");
		recordSpend({ workspaceId: WORKSPACE, keyId: KEY, billingRequestId: "b1", requestId: "r1", costNanos: 100, admission: first.admission });
		recordSpend({ workspaceId: WORKSPACE, keyId: KEY, billingRequestId: "b2", requestId: "r2", costNanos: 200 });
		await flush();
		expect((await probe())?.daily).toMatchObject({ requestsUsed: 2, costUsedNanos: 300 });
		// r1's row lands; r2's is still being written. A batch job writes its own row.
		database.rows.push(
			{ requestId: "r1", keyId: KEY, success: true, cost: 100, createdAt: Date.now() },
			{ requestId: "batch-1", keyId: KEY, success: true, cost: 1_000, createdAt: Date.now() },
		);
		vi.setSystemTime(Date.now() + SPEND_LEASE.reseedMs + 1);
		await probe();
		await flush();
		expect(database.calls.at(-1)?.exclude.sort()).toEqual(["b1", "b2", "r1", "r2"]);
		expect((await probe())?.daily).toMatchObject({ requestsUsed: 3, costUsedNanos: 1_300 });

		// r1 is now known to be persisted: the next seed counts it instead of excluding it.
		database.rows.push({ requestId: "r2", keyId: KEY, success: true, cost: 200, createdAt: Date.now() });
		vi.setSystemTime(Date.now() + SPEND_LEASE.reseedMs + 1);
		await probe();
		await flush();
		expect(database.calls.at(-1)?.exclude.sort()).toEqual(["b2", "r2"]);
		expect((await probe())?.daily).toMatchObject({ requestsUsed: 3, costUsedNanos: 1_300 });
		vi.setSystemTime(Date.now() + SPEND_LEASE.reseedMs + 1);
		await probe();
		await flush();
		expect(database.calls.at(-1)?.exclude).toEqual([]);
		expect((await probe())?.daily).toMatchObject({ requestsUsed: 3, costUsedNanos: 1_300 });
	});

	it("releases slices on return, and holds unreturned ones only until shortly after expiry", async () => {
		database.keys.set(KEY, { workspaceId: WORKSPACE, daily: [20, 0] });
		const hoarder = isolate();
		const first = await hoarder.admit();
		if (!("ticket" in first)) throw new Error("expected admission");
		await hoarder.succeed(first.ticket, 1);
		// Exhaust the remaining allowance in another isolate.
		const other = isolate();
		let results = [];
		for (let i = 0; i < 25; i++) {
			const result = await other.admit();
			results.push(result);
			if ("ticket" in result) await other.succeed(result.ticket, 1); else break;
		}
		const held = hoarder.pool.snapshot().reduce((sum, lease) => sum + (lease.requests ?? 0) - lease.usedRequests, 0);
		const denial = results.at(-1)!;
		expect("denial" in denial && denial.denial.contended).toBe(held > 0);
		// Never returned: the hold ends shortly after the lease expires.
		vi.setSystemTime(Date.now() + SPEND_LEASE.ttlMs + SPEND_LEASE.expiryGraceMs + 1);
		results = [];
		for (let i = 0; i < 25; i++) {
			const result = await other.admit();
			results.push(result);
			if ("ticket" in result) await other.succeed(result.ticket, 1); else break;
		}
		expect(results.filter((result) => "ticket" in result)).toHaveLength(held);
		expect(results.at(-1)).toMatchObject({ denial: { contended: false, gate: { reason: "daily_request_limit_reached", currentValue: 20 } } });
	});

	it("keeps the requests of a returned slice held until they are recorded or released", async () => {
		database.keys.set(KEY, { workspaceId: WORKSPACE, daily: [40, 0] });
		const node = isolate();
		const tickets = [];
		for (let i = 0; i < 3; i++) {
			const result = await node.admit();
			if (!("ticket" in result)) throw new Error("expected admission");
			tickets.push(result.ticket);
		}
		await flush();
		await coordinator.returnLeases(WORKSPACE, node.pool.drain());
		const probe = isolate();
		const fill = async () => {
			let count = 0;
			for (;;) {
				const result = await probe.admit();
				if (!("ticket" in result)) return { count, denial: result.denial };
				count++;
				await probe.succeed(result.ticket, 0);
			}
		};
		expect((await fill()).count).toBe(37);
		await node.succeed(tickets[0], 5);
		await node.fail(tickets[1]);
		await coordinator.returnLeases(WORKSPACE, probe.pool.drain());
		const after = await fill();
		expect(after.count).toBe(1);
		expect(after.denial.contended).toBe(true);
	});

	it("rolls over UTC day, week and month exactly like the database", async () => {
		database.keys.set(KEY, { workspaceId: WORKSPACE, daily: [1_000, 0], weekly: [5_000, 0], monthly: [9_000, 0] });
		const spend = async (count: number) => {
			for (let i = 0; i < count; i++) {
				const id = `${Date.now()}-${i}`;
				const decision = await checkSpendLimit({ workspaceId: WORKSPACE, keyId: KEY, admissionId: id });
				if (decision.outcome !== "allowed") throw new Error(`expected admission: ${decision.outcome}`);
				recordSpend({ workspaceId: WORKSPACE, keyId: KEY, billingRequestId: id, requestId: id, costNanos: 1, admission: decision.admission });
				database.rows.push({ requestId: id, keyId: KEY, success: true, cost: 1, createdAt: Date.now() });
			}
			await flush();
		};
		// Saturday 28 Nov -> Monday 30 Nov (new week) -> Tuesday 1 Dec (new month).
		for (const at of ["2026-11-28T23:59:30Z", "2026-11-29T00:00:30Z", "2026-11-29T23:59:30Z", "2026-11-30T00:00:30Z",
			"2026-11-30T23:59:30Z", "2026-12-01T00:00:30Z"]) {
			vi.setSystemTime(new Date(at));
			await spend(3);
			const buckets = await probe();
			const expected = database.usage(KEY);
			expect([buckets?.daily?.requestsUsed, buckets?.weekly?.requestsUsed, buckets?.monthly?.requestsUsed], at)
				.toEqual([expected.daily.requests, expected.weekly.requests, expected.monthly.requests]);
			const windows = FakeDatabase.windows(Date.now());
			expect([buckets?.daily?.windowStart, buckets?.weekly?.windowStart, buckets?.monthly?.windowStart], at)
				.toEqual([windows.daily, windows.weekly, windows.monthly].map((ms) => new Date(ms).toISOString()));
		}
		// Leases never cross midnight.
		vi.setSystemTime(new Date("2026-12-01T23:59:57Z"));
		const late = await coordinator.acquire(WORKSPACE, KEY, { requests: 1, units: 0 }, { requests: 50, units: 0 }, [], "late");
		expect("lease" in late && late.lease.expiresAt).toBe(0);
	});

	it("enforces soft blocks and workspace budgets with the context reasons", async () => {
		database.keys.set("blocked", { workspaceId: WORKSPACE, softBlocked: true });
		expect(await checkSpendLimit({ workspaceId: WORKSPACE, keyId: "blocked", admissionId: "x" })).toMatchObject({
			outcome: "denied", keyLimit: { ok: false, reason: "key_limit_soft_blocked", limitMetric: "soft_blocked" },
		});
		database.keys.set("free", { workspaceId: WORKSPACE });
		database.budgets.push({ id: "budget-daily", interval: "daily", limit: 500, holds: 20 });
		database.rows.push({ requestId: "spent", keyId: "other", success: true, cost: 470, createdAt: Date.now() });
		const allowed = await checkSpendLimit({ workspaceId: WORKSPACE, keyId: "free", admissionId: "y" });
		if (allowed.outcome !== "allowed") throw new Error("expected admission");
		recordSpend({ workspaceId: WORKSPACE, keyId: "free", billingRequestId: "y", requestId: "y", costNanos: 21, admission: allowed.admission });
		await flush();
		const denied = await checkSpendLimit({ workspaceId: WORKSPACE, keyId: "free", admissionId: "z" });
		expect(denied).toMatchObject({ outcome: "denied", keyLimit: {
			ok: false, reason: "workspace_daily_cost_budget_reached", limitWindow: "daily", limitMetric: "cost",
			currentValue: 511, limitValue: 500, resetAt: "2026-10-10T00:00:00.000Z",
		} });
		expect(denied.keyLimit?.budgets?.[0]).toMatchObject({ id: "budget-daily", usageNanos: 511, exceeded: true });
	});

	it("grants unlimited leases to keys and workspaces without limits", async () => {
		database.keys.set("open", { workspaceId: WORKSPACE });
		const decision = await checkSpendLimit({ workspaceId: WORKSPACE, keyId: "open", admissionId: "o" });
		expect(decision).toMatchObject({ outcome: "allowed", admission: { unlimited: true } });
		for (let i = 0; i < 50; i++) expect(await checkSpendLimit({ workspaceId: WORKSPACE, keyId: "open", admissionId: `o${i}` })).toMatchObject({ source: "lease" });
		expect(sqlite.prepare("SELECT COUNT(*) AS count FROM leases").get()).toEqual({ count: 0 });
	});

	it("persists only open slices and keeps holding them after a restart", async () => {
		database.keys.set(KEY, { workspaceId: WORKSPACE, daily: [20, 0] });
		const node = isolate();
		await node.admit();
		const [{ id: leaseId, requests: granted }] = node.pool.snapshot() as Array<{ id: string; requests: number }>;
		expect(sqlite.prepare("SELECT COUNT(*) AS count FROM leases").get()).toEqual({ count: 1 });
		coordinator = createCoordinator();
		const fresh = isolate();
		let allowed = 0;
		for (let i = 0; i < 30; i++) {
			const result = await fresh.admit();
			if (!("ticket" in result)) break;
			allowed++;
			await fresh.succeed(result.ticket, 0);
		}
		expect(allowed).toBe(20 - granted);
		expect(sqlite.prepare("SELECT COUNT(*) AS count FROM leases WHERE id = ?").get(leaseId)).toEqual({ count: 1 });
		await coordinator.returnLeases(WORKSPACE, node.pool.drain());
		expect(sqlite.prepare("SELECT COUNT(*) AS count FROM leases WHERE id = ?").get(leaseId)).toEqual({ count: 0 });
	});

	it("reports the coordinator as unavailable instead of failing open", async () => {
		database.fail = true;
		const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
		try {
			expect(await checkSpendLimit({ workspaceId: WORKSPACE, keyId: KEY, admissionId: "u" })).toMatchObject({
				outcome: "unavailable", keyLimit: null, error: "database unavailable",
			});
			runtime.bindings = {};
			expect(await checkSpendLimit({ workspaceId: WORKSPACE, keyId: KEY, admissionId: "v" })).toMatchObject({
				outcome: "unavailable", error: "spend_limit_binding_missing",
			});
		} finally { log.mockRestore(); }
	});

	it("shadows the legacy decision without holding allowance and logs divergence", async () => {
		database.keys.set(KEY, { workspaceId: WORKSPACE, daily: [1, 0] });
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		try {
			const agree = await shadowSpendLimit({ workspaceId: WORKSPACE, keyId: KEY, admissionId: "s1" }, { ok: true, reason: null });
			expect(agree).toMatchObject({ diverged: false, coordinator: { outcome: "allowed" } });
			// The shadow admission was released, so the single allowed request is still available.
			const again = await shadowSpendLimit({ workspaceId: WORKSPACE, keyId: KEY, admissionId: "s2" }, { ok: true, reason: null });
			expect(again.diverged).toBe(false);
			recordSpend({ workspaceId: WORKSPACE, keyId: KEY, billingRequestId: "s2", requestId: "s2", costNanos: 0 });
			await flush();
			const diverged = await shadowSpendLimit({ workspaceId: WORKSPACE, keyId: KEY, admissionId: "s3" }, { ok: true, reason: null });
			expect(diverged).toMatchObject({ diverged: true, coordinator: { outcome: "denied", reason: "daily_request_limit_reached" } });
			expect(warn).toHaveBeenCalledWith("spend_limit_shadow_divergence", expect.objectContaining({ keyId: KEY }));
			const sameReason = await shadowSpendLimit({ workspaceId: WORKSPACE, keyId: KEY, admissionId: "s4" },
				{ ok: false, reason: "daily_request_limit_reached" });
			expect(sameReason.diverged).toBe(false);
		} finally { warn.mockRestore(); }
	});

	it("wires shadow mode: each API-key request is compared once and its spend counted, only when the flag says shadow", async () => {
		const API_KEY = "00000000-0000-4000-8000-000000000001";
		database.keys.set(API_KEY, { workspaceId: WORKSPACE, daily: [1, 0] });
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const bindings = runtime.bindings!;
		try {
			bindings.GATEWAY_SPEND_LIMIT_DO_MODE = "off";
			shadowSpendLimitOnce({ workspaceId: WORKSPACE, keyId: API_KEY, requestId: "off" }, { ok: true, reason: null });
			recordShadowSpend({ workspaceId: WORKSPACE, keyId: API_KEY, billingRequestId: "off", requestId: "off", costNanos: 5 });
			await flush();
			expect(database.calls).toHaveLength(0);

			bindings.GATEWAY_SPEND_LIMIT_DO_MODE = "shadow";
			// Internal requests and non-UUID key IDs (OAuth client IDs) are never shadowed.
			shadowSpendLimitOnce({ workspaceId: WORKSPACE, keyId: API_KEY, requestId: "internal", internal: true }, { ok: true, reason: null });
			shadowSpendLimitOnce({ workspaceId: WORKSPACE, keyId: "client_app", requestId: "oauth" }, { ok: true, reason: null });
			recordShadowSpend({ workspaceId: WORKSPACE, keyId: "client_app", billingRequestId: "oauth", requestId: "oauth", costNanos: 5 });
			await flush();
			expect(database.calls).toHaveLength(0);

			// guardContext can run several times for one request; only the first compares.
			shadowSpendLimitOnce({ workspaceId: WORKSPACE, keyId: API_KEY, requestId: "r1" }, { ok: true, reason: null });
			shadowSpendLimitOnce({ workspaceId: WORKSPACE, keyId: API_KEY, requestId: "r1" }, { ok: true, reason: null });
			await flush();
			expect(database.calls).toHaveLength(1);
			expect(warn).not.toHaveBeenCalledWith("spend_limit_shadow_divergence", expect.anything());

			// The success row is counted, so the coordinator now agrees the daily request is used...
			recordShadowSpend({ workspaceId: WORKSPACE, keyId: API_KEY, billingRequestId: "b1", requestId: "r1", costNanos: 0 });
			await flush();
			shadowSpendLimitOnce({ workspaceId: WORKSPACE, keyId: API_KEY, requestId: "r2" }, { ok: false, reason: "daily_request_limit_reached" });
			await flush();
			expect(warn).not.toHaveBeenCalledWith("spend_limit_shadow_divergence", expect.anything());
			// ...and reports it when the legacy check disagrees.
			shadowSpendLimitOnce({ workspaceId: WORKSPACE, keyId: API_KEY, requestId: "r3" }, { ok: true, reason: null });
			await flush();
			expect(warn).toHaveBeenCalledWith("spend_limit_shadow_divergence", expect.objectContaining({
				keyId: API_KEY, coordinator: expect.objectContaining({ outcome: "denied", reason: "daily_request_limit_reached" }),
			}));
		} finally { warn.mockRestore(); }
	});

	describe("seed transitions never under-count", () => {
		// A $4 shared guardrail over two keys: A spends, B is refused once A's spend reaches it.
		const A = "transition-a";
		const B = "transition-b";
		let unstall: () => void = () => {};
		const stall = () => { database.stall = new Promise((resolve) => { unstall = resolve; }); };
		const release = async () => { database.stall = null; unstall(); await flush(); };
		/** B's admission: the counter's value when refused, or "allowed". */
		const admitB = async () => {
			const id = `b-${Math.random()}`;
			const result = await coordinator.acquire(WORKSPACE, B, { requests: 1, units: 0 }, { requests: 1, units: 0 }, [], id);
			if ("denial" in result) return result.denial?.gate.currentValue;
			if (result.lease.expiresAt) await coordinator.returnLeases(WORKSPACE, [{ id: result.lease.id, usedRequests: 0, usedUnits: 0, inFlightRequests: 0 }]);
			else await coordinator.release(WORKSPACE, result.lease.id, id);
			return "allowed";
		};
		/** Publishes a fresh seed (the background reseed after a minute). */
		const reseedNow = async () => {
			vi.setSystemTime(Date.now() + SPEND_LEASE.reseedMs + 1);
			await admitB();
			await flush();
		};
		beforeEach(async () => {
			for (const keyId of [A, B]) database.keys.set(keyId, { workspaceId: WORKSPACE });
			database.guardrails.push({ guardrailId: "g-t", name: "Team", counting: "shared", counter: "department:d-t", interval: "daily", limit: 400, keyIds: [A, B] });
			await coordinator.acquire(WORKSPACE, A, { requests: 1, units: 0 }, { requests: 1, units: 0 }, [], "warm-a");
			expect(await admitB()).toBe("allowed");
		});

		// A's $4.50 request was charged; its audit row never lands, so only the charge row records it.
		const chargeA = async () => {
			database.charges.push({ billingId: "bill-a", keyId: A, total: 450, at: Date.now() });
			await coordinator.record(WORKSPACE, { keyId: A, billingRequestId: "bill-a", requestId: "req-a", costNanos: 450, requests: 1 });
			expect(await admitB()).toBe(450);
		};
		// Keeps the seed fresh while the entry ages to just under its pending TTL, then past it: the
		// next reload is the first to hand it to the database.
		const ageEntryPastTtl = async (counted: number | "allowed" = 450) => {
			const recordedAt = Date.now();
			while (Date.now() + 3 * 60_000 + SPEND_LEASE.reseedMs + 1 < recordedAt + SPEND_LEASE.pendingTtlMs) {
				vi.setSystemTime(Date.now() + 3 * 60_000);
				await reseedNow();
				expect(await admitB()).toBe(counted);
			}
			vi.setSystemTime(recordedAt + SPEND_LEASE.pendingTtlMs + 30_000);
		};

		// A's stream, charged at drain checkpoints: the debit of the increase, then its report.
		const checkpointA = async (billingId: string, total: number, revision: number) => {
			const charged = database.charges.filter((charge) => charge.billingId === billingId).reduce((sum, charge) => sum + charge.total, 0);
			if (total !== charged) database.charges.push({ billingId, keyId: A, total: total - charged, at: Date.now() });
			return coordinator.record(WORKSPACE, { keyId: A, billingRequestId: billingId, requestId: `req-${billingId}`, costNanos: total, requests: 1, replace: true, revision });
		};

		it("refuses the other key at once when a checkpoint arrives after a successful handoff", async () => {
			await checkpointA("bill-after", 300, 1);
			await ageEntryPastTtl("allowed");
			// This seed takes the $3 entry over and is published: the seed counts the $3 charge row.
			await reseedNow();
			expect((coordinator as unknown as { pending: Map<string, unknown> }).pending.has("bill-after")).toBe(false);
			expect(await admitB()).toBe("allowed");
			// The stream then debits $1.50 more. The published seed read before that debit: the $1.50
			// counts from memory at once, so B is refused before the next seed.
			expect(await checkpointA("bill-after", 450, 2)).toMatchObject({ duplicates: 0 });
			expect(await admitB()).toBe(450);
			await reseedNow();
			expect(await admitB()).toBe(450);
			await reseedNow();
			expect(await admitB()).toBe(450);
		});

		it("counts a checkpoint that raises an expired entry while the seed taking it over is loading", async () => {
			await checkpointA("bill-live", 300, 1);
			await ageEntryPastTtl("allowed");
			stall();
			// This admission starts the reload that hands the $3 entry over ($3 of $4: allowed).
			expect(await admitB()).toBe("allowed");
			// The stream debits $1.50 more while the seed loads: the handed-off entry still takes it.
			expect(await checkpointA("bill-live", 450, 2)).toMatchObject({ duplicates: 0 });
			expect(await admitB()).toBe(450);
			await release();
			// Raised after that seed's read started, so it stays held one more seed (an over-count) ...
			expect(await admitB()).toBeGreaterThanOrEqual(450);
			// ... and the next seed, read after the raise, takes it over exactly.
			await reseedNow();
			expect(await admitB()).toBe(450);
		});

		it("counts a checkpoint that raises an expired entry while the seed taking it over fails", async () => {
			await checkpointA("bill-fail", 300, 1);
			await ageEntryPastTtl("allowed");
			database.fail = true;
			expect(await admitB()).toBe("allowed");
			await flush();
			expect(await checkpointA("bill-fail", 450, 2)).toMatchObject({ duplicates: 0 });
			expect(await admitB()).toBe(450);
			database.fail = false;
			await reseedNow();
			expect(await admitB()).toBe(450);
		});

		// 2,600 stepped requests of $0.01 under a $100 counter: the reload that starts at 2,500 loads
		// again with 2,600 (5,200 ids), excluding the newest 2,500 and handing the rest over.
		const raiseLimit = async () => {
			database.guardrails[0].limit = 10_000;
			await reseedNow();
		};
		const overflow = async () => {
			for (let batch = 0; batch < 26; batch += 1) {
				await coordinator.record(WORKSPACE, Array.from({ length: 100 }, (_, index) => {
					const n = batch * 100 + index;
					return { keyId: A, billingRequestId: `bill-ov-${n}`, requestId: `req-ov-${n}`, costNanos: 1, requests: 1, replace: true, revision: 1 };
				}));
			}
		};
		const overflowed = () => [...(coordinator as unknown as { pending: Map<string, { billingRequestId: string; retiring?: string }> }).pending.values()]
			.find((entry) => entry.retiring === "overflow")!.billingRequestId;

		it("counts a checkpoint that raises an overflowed entry while the seed taking it over is loading", async () => {
			await raiseLimit();
			stall();
			const first = unstall;
			await overflow();
			stall();
			first();
			for (let i = 0; i < 5; i += 1) await tick();
			expect(await admitB()).toBe("allowed");
			// One handed-over stream debits to $75: 2,599 + 7,500 = 10,099 of 10,000.
			await coordinator.record(WORKSPACE, { keyId: A, billingRequestId: overflowed(), requestId: "r", costNanos: 7_500, requests: 1, replace: true, revision: 2 });
			expect(await admitB()).toBe(10_099);
			await release();
		});

		it("counts a checkpoint that raises an overflowed entry while the seed taking it over fails", async () => {
			await raiseLimit();
			database.fail = true;
			await overflow();
			await flush();
			await (coordinator as unknown as { reseed(key: string | null): Promise<void> }).reseed(null).catch(() => undefined);
			await coordinator.record(WORKSPACE, { keyId: A, billingRequestId: overflowed(), requestId: "r", costNanos: 7_500, requests: 1, replace: true, revision: 2 });
			expect(await admitB()).toBe(10_099);
			database.fail = false;
		});

		it("keeps an expired entry counted while the seed that takes it over is loading", async () => {
			await chargeA();
			await ageEntryPastTtl();
			stall();
			// This admission starts the reload that hands the entry to the database, and must not pass.
			expect(await admitB()).toBe(450);
			expect(await admitB()).toBe(450);
			await release();
			// The new seed counts the charge row; memory no longer holds the entry.
			expect(database.calls.at(-1)?.exclude).toEqual([]);
			expect(await admitB()).toBe(450);
		});

		it("keeps an expired entry counted while the seed that takes it over fails to load", async () => {
			await chargeA();
			await ageEntryPastTtl();
			database.fail = true;
			expect(await admitB()).toBe(450);
			await flush();
			expect(await admitB()).toBe(450);
			database.fail = false;
			await reseedNow();
			expect(database.calls.at(-1)?.exclude).toEqual([]);
			expect(await admitB()).toBe(450);
		});

		it("counts entries past the exclusion limit while the seed that takes them over is loading", async () => {
			// The reload starts when 2,500 requests reach the 5,000-id limit and stalls; 100 more are
			// recorded while it loads, so it loads again with 2,600 requests (5,200 ids): the newest
			// 2,500 are excluded and the oldest 100 handed to the seed. That second load stalls too.
			stall();
			const first = unstall;
			for (let batch = 0; batch < 26; batch += 1) {
				await coordinator.record(WORKSPACE, Array.from({ length: 100 }, (_, index) => {
					const n = batch * 100 + index;
					return { keyId: A, billingRequestId: `bill-o-${n}`, requestId: `req-o-${n}`, costNanos: 1, requests: 1 };
				}));
			}
			stall();
			first();
			for (let i = 0; i < 5; i += 1) await tick();
			// The second load has started with the overflow handed over: all 2,600 still count.
			expect(await admitB()).toBe(2_600);
			await release();
			expect(database.calls.at(-1)?.exclude).toHaveLength(SPEND_LEASE.maxExcludedRequestIds);
		});

		it("counts a checkpoint recorded after a restart at once, before the seed that excludes it loads", async () => {
			// B already spent $3; A's stream debits $4.50 at checkpoint 2, whose record reaches a
			// restarted coordinator (checkpoint 1's record went to the previous one).
			database.rows.push({ requestId: "b-earlier", keyId: B, success: true, cost: 300, createdAt: Date.now() });
			coordinator = createCoordinator();
			await coordinator.acquire(WORKSPACE, A, { requests: 1, units: 0 }, { requests: 1, units: 0 }, [], "warm-a2");
			expect(await admitB()).toBe("allowed");
			database.charges.push({ billingId: "bill-s", keyId: A, total: 450, at: Date.now() });
			stall();
			await coordinator.record(WORKSPACE, { keyId: A, billingRequestId: "bill-s", requestId: "req-s", costNanos: 450, requests: 1, replace: true, revision: 2 });
			// Counted at once: $3 + $4.50, though the published seed counts nothing of it yet.
			expect(await admitB()).toBe(750);
			await release();
			expect(await admitB()).toBe(750);
		});

		it("counts a final that arrives first, before the seed that excludes it loads", async () => {
			database.rows.push({ requestId: "b-earlier", keyId: B, success: true, cost: 300, createdAt: Date.now() });
			await reseedNow();
			database.charges.push({ billingId: "bill-f", keyId: A, total: 450, at: Date.now() });
			stall();
			await coordinator.record(WORKSPACE, { keyId: A, billingRequestId: "bill-f", requestId: "req-f", costNanos: 450, requests: 1, replace: true, final: true });
			expect(await admitB()).toBe(750);
			await release();
			expect(await admitB()).toBe(750);
		});
	});

	describe("the last seed attempt reads across a period boundary", () => {
		// Two requests recorded while the seed loads use up attempts 1 and 2; attempt 3 starts before
		// the boundary and reads after it, when a held stream debits $4.50 more. The seed excludes the
		// stream, which opened in the old period: it must still count in the new one.
		it.each([
			["day", "2026-10-09T23:58:00Z", "2026-10-10T00:00:01Z", "daily"],
			["week", "2026-10-11T23:58:00Z", "2026-10-12T00:00:01Z", "weekly"],
			["month", "2026-10-31T23:58:00Z", "2026-11-01T00:00:01Z", "monthly"],
		] as const)("counts an increase made in the new %s", async (_label, before, after, window) => {
			const key = "boundary-key";
			database.keys.set(key, { workspaceId: WORKSPACE, daily: [0, 400], weekly: [0, 400], monthly: [0, 400] });
			vi.setSystemTime(new Date(before));
			await probe(key);
			const stream = { keyId: key, billingRequestId: "bill-edge", requestId: "req-edge", requests: 1, replace: true };
			database.charges.push({ billingId: "bill-edge", keyId: key, total: 100, at: Date.now() });
			await coordinator.record(WORKSPACE, { ...stream, costNanos: 100, revision: 1 });
			let attempt = 0;
			let lastAttemptRead = false;
			database.afterRead = async () => {
				attempt += 1;
				if (attempt < 3) await coordinator.record(WORKSPACE, { keyId: key, billingRequestId: `late-${attempt}`, requestId: `req-late-${attempt}`, costNanos: 0, requests: 0 });
				if (attempt === 2) {
					database.beforeRead = async () => {
						database.beforeRead = null;
						database.afterRead = null;
						lastAttemptRead = true;
						vi.setSystemTime(new Date(after));
						database.charges.push({ billingId: "bill-edge", keyId: key, total: 450, at: Date.now() });
						await coordinator.record(WORKSPACE, { ...stream, costNanos: 550, revision: 2 });
					};
				}
			};
			await (coordinator as unknown as { reseed(key: string | null): Promise<void> }).reseed(null);
			expect(lastAttemptRead).toBe(true);
			const result = await coordinator.acquire(WORKSPACE, key, { requests: 1, units: 0 }, { requests: 1, units: 0 }, [], "edge");
			const buckets = "denial" in result ? result.denial?.gate.buckets : result.lease.meta.buckets;
			expect(buckets?.[window].costUsedNanos).toBeGreaterThanOrEqual(450);
			expect("denial" in result && result.denial).toBeTruthy();
		});
	});

	it("keeps the pending map bounded while seeds keep failing, and loses no spend until one succeeds", async () => {
		const internals = coordinator as unknown as {
			pending: Map<string, unknown>; handoffBuckets: Map<string, unknown>; seed: { windows: Record<"daily", number> };
			reseed(key: string | null): Promise<void>; keyUsage(key: string, window: "daily", windows: unknown): { cost: number };
		};
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		await probe();
		database.fail = true;
		for (let round = 1; round <= 2; round += 1) {
			for (let batch = 0; batch < 30; batch += 1) {
				const entries = Array.from({ length: 100 }, (_, index) => ({
					keyId: KEY, billingRequestId: `bill-g-${round}-${batch}-${index}`, requestId: `req-g-${round}-${batch}-${index}`, costNanos: 1, requests: 0,
				}));
				for (const entry of entries) database.charges.push({ billingId: entry.billingRequestId, keyId: KEY, total: 1, at: Date.now() });
				await coordinator.record(WORKSPACE, entries);
			}
			await flush();
			// Every entry expires; each failing seed hands them over again, and none succeeds.
			vi.setSystemTime(Date.now() + SPEND_LEASE.pendingTtlMs + 60_000);
			await internals.reseed(null).catch(() => undefined);
			await internals.reseed(null).catch(() => undefined);
			expect(internals.pending.size).toBeLessThanOrEqual(2_500);
			expect(internals.handoffBuckets.size).toBe(1);
			expect(internals.keyUsage(KEY, "daily", internals.seed.windows).cost).toBe(round * 3_000);
		}
		// The database recovers: the seed counts the charges, and memory lets them go.
		database.fail = false;
		await internals.reseed(null);
		expect(internals.pending.size).toBe(0);
		expect(internals.handoffBuckets.size).toBe(0);
		expect((await probe())?.daily).toMatchObject({ costUsedNanos: 6_000 });
		warn.mockRestore();
	});

	it("refuses an admission that arrives between a charged failure's release and its cost", async () => {
		runtime.bindings = { ...runtime.bindings!, GATEWAY_SPEND_LIMIT_DO_MODE: "enforce" };
		const key = "00000000-0000-4000-8000-000000000009";
		// One request and $4 a day; the request fails but is charged $4.50.
		database.keys.set(key, { workspaceId: WORKSPACE, daily: [1, 400] });
		const first = await checkSpendLimit({ workspaceId: WORKSPACE, keyId: key, admissionId: "failure" });
		if (first.outcome !== "allowed") throw new Error("expected admission");
		database.charges.push({ billingId: "bill-failure", keyId: key, total: 450, at: Date.now() });
		settleEnforcedSpend({ admission: first.admission, rowWritten: true, workspaceId: WORKSPACE, keyId: key,
			billingRequestId: "bill-failure", requestId: "failure", costNanos: 450, requests: 0 });
		await tick();
		// Before the batched record reaches the coordinator, the slot is not yet free.
		const racing = await coordinator.acquire(WORKSPACE, key, { requests: 1, units: 0 }, { requests: 1, units: 0 }, [], "racing");
		expect("denial" in racing && racing.denial).toBeTruthy();
		await flush();
		expect((await probe(key))?.daily).toMatchObject({ requestsUsed: 0, costUsedNanos: 450 });
	});

	describe("spend guardrails", () => {
		const TEAM_A = "team-a";
		const TEAM_B = "team-b";
		const OUTSIDER = "outsider";
		const shared = (limit: number): GuardrailCounter => ({
			guardrailId: "g-team", name: "Contractors", counting: "shared", counter: "department:d-team", interval: "daily", limit, keyIds: [TEAM_A, TEAM_B],
		});
		const eachKey = (keyId: string, limit: number): GuardrailCounter => ({
			guardrailId: "g-each", name: "Every key", counting: "each_key", counter: `key:${keyId}`, interval: "monthly", limit, keyIds: [keyId],
		});

		beforeEach(() => {
			for (const keyId of [TEAM_A, TEAM_B, OUTSIDER]) database.keys.set(keyId, { workspaceId: WORKSPACE });
		});

		it("blocks every key a shared counter covers once its limit is used, and no other key", async () => {
			database.guardrails.push(shared(1_000));
			database.rows.push(
				{ requestId: "a-1", keyId: TEAM_A, success: true, cost: 700, createdAt: Date.now() - 1_000 },
				{ requestId: "b-1", keyId: TEAM_B, success: true, cost: 300, createdAt: Date.now() - 1_000 },
				{ requestId: "o-1", keyId: OUTSIDER, success: true, cost: 9_000, createdAt: Date.now() - 1_000 },
			);
			for (const keyId of [TEAM_A, TEAM_B]) {
				expect(await checkSpendLimit({ workspaceId: WORKSPACE, keyId, admissionId: `${keyId}-2` })).toMatchObject({
					outcome: "denied",
					keyLimit: {
						ok: false, reason: "guardrail_daily_spend_limit_reached", limitWindow: "daily", limitMetric: "cost",
						currentValue: 1_000, limitValue: 1_000, guardrailId: "g-team", guardrailName: "Contractors", guardrailCounting: "shared",
					},
				});
			}
			expect(await checkSpendLimit({ workspaceId: WORKSPACE, keyId: OUTSIDER, admissionId: "o-2" }))
				.toMatchObject({ outcome: "allowed", admission: { unlimited: true } });
		});

		it("counts each key on its own when the guardrail counts each key", async () => {
			database.guardrails.push(eachKey(TEAM_A, 500), eachKey(TEAM_B, 500));
			database.rows.push({ requestId: "a-1", keyId: TEAM_A, success: true, cost: 500, createdAt: Date.now() - 1_000 });
			expect(await checkSpendLimit({ workspaceId: WORKSPACE, keyId: TEAM_A, admissionId: "a-2" })).toMatchObject({
				outcome: "denied",
				keyLimit: { reason: "guardrail_monthly_spend_limit_reached", guardrailId: "g-each", guardrailCounting: "each_key", currentValue: 500 },
			});
			expect(await checkSpendLimit({ workspaceId: WORKSPACE, keyId: TEAM_B, admissionId: "b-2" })).toMatchObject({ outcome: "allowed" });
		});

		it("ignores spend guardrails missing from older seeds", async () => {
			database.guardrails.push(shared(1));
			database.legacyShape = true;
			database.rows.push({ requestId: "a-1", keyId: TEAM_A, success: true, cost: 50, createdAt: Date.now() - 1_000 });
			expect(await checkSpendLimit({ workspaceId: WORKSPACE, keyId: TEAM_A, admissionId: "a-2" })).toMatchObject({ outcome: "allowed" });
		});
	});

	describe("department budgets", () => {
		const ENG_A = "eng-a";
		const ENG_B = "eng-b";
		const OUTSIDER = "outsider";
		const engineering = (limit: number): DepartmentBudget => ({
			id: "dept-budget-1", departmentId: "dept-eng", name: "Engineering", interval: "daily", limit, keyIds: [ENG_A, ENG_B],
		});
		const admit = (keyId: string, admissionId: string, wantUnits = 0) =>
			coordinator.acquire(WORKSPACE, keyId, { requests: 1, units: 0 }, { requests: 1, units: wantUnits }, [], admissionId);

		beforeEach(() => {
			for (const keyId of [ENG_A, ENG_B, OUTSIDER]) database.keys.set(keyId, { workspaceId: WORKSPACE });
		});

		it("blocks every key of a department once its budget is used, and no other key", async () => {
			database.departments.push(engineering(1_000));
			database.rows.push(
				{ requestId: "a-1", keyId: ENG_A, success: true, cost: 600, createdAt: Date.now() - 1_000 },
				{ requestId: "a-yesterday", keyId: ENG_A, success: true, cost: 5_000, createdAt: Date.parse("2026-10-08T23:59:59Z") },
				{ requestId: "o-1", keyId: OUTSIDER, success: true, cost: 9_000, createdAt: Date.now() - 1_000 },
			);
			// Below the budget: admitted (its own cost is unknown until it completes).
			const allowed = await checkSpendLimit({ workspaceId: WORKSPACE, keyId: ENG_B, admissionId: "b-1" });
			if (allowed.outcome !== "allowed") throw new Error("expected admission");
			expect(allowed.admission.unlimited).toBe(false);
			recordSpend({ workspaceId: WORKSPACE, keyId: ENG_B, billingRequestId: "b-1", requestId: "b-1", costNanos: 450, admission: allowed.admission });
			await flush();
			for (const keyId of [ENG_A, ENG_B]) {
				expect(await checkSpendLimit({ workspaceId: WORKSPACE, keyId, admissionId: `${keyId}-2` })).toMatchObject({
					outcome: "denied",
					contended: false,
					keyLimit: {
						ok: false, reason: "department_daily_cost_budget_reached", limitWindow: "daily", limitMetric: "cost",
						currentValue: 1_050, limitValue: 1_000, resetAt: "2026-10-10T00:00:00.000Z",
						departmentId: "dept-eng", departmentName: "Engineering",
					},
				});
			}
			expect(await checkSpendLimit({ workspaceId: WORKSPACE, keyId: OUTSIDER, admissionId: "o-2" }))
				.toMatchObject({ outcome: "allowed", admission: { unlimited: true } });
		});

		it("comes after the key's own limits and before workspace budgets", async () => {
			database.departments.push(engineering(100));
			database.budgets.push({ id: "ws-daily", interval: "daily", limit: 100 });
			database.keys.set(ENG_A, { workspaceId: WORKSPACE, daily: [0, 100] });
			database.rows.push({ requestId: "a-1", keyId: ENG_A, success: true, cost: 150, createdAt: Date.now() - 1_000 });
			expect((await checkSpendLimit({ workspaceId: WORKSPACE, keyId: ENG_A, admissionId: "a" })).keyLimit?.reason).toBe("daily_cost_limit_reached");
			expect((await checkSpendLimit({ workspaceId: WORKSPACE, keyId: ENG_B, admissionId: "b" })).keyLimit?.reason).toBe("department_daily_cost_budget_reached");
			expect((await checkSpendLimit({ workspaceId: WORKSPACE, keyId: OUTSIDER, admissionId: "o" })).keyLimit?.reason).toBe("workspace_daily_cost_budget_reached");
		});

		it("caps slices by the department's remainder and reports a held remainder as contended", async () => {
			database.departments.push(engineering(1_000));
			const granted = await admit(ENG_A, "a-1", 1_000_000);
			// (1,000 - 5% reserve) / 4 shares.
			expect(granted).toMatchObject({ ok: true, lease: { units: 237 } });
			// Spend from another key of the department (no slice) brings usage to 800: with 237 held, nothing is left.
			await coordinator.record(WORKSPACE, { keyId: ENG_B, billingRequestId: "b-1", requestId: "b-1", costNanos: 800, requests: 1 });
			const denied = await admit(ENG_B, "b-2");
			expect(denied).toMatchObject({ ok: false, denial: { contended: true, gate: { reason: "department_daily_cost_budget_reached", currentValue: 800 } } });
			// Holders of any key's slices are asked to hand them back.
			expect((await coordinator.record(WORKSPACE, { keyId: ENG_A, billingRequestId: "a-x", requestId: "a-x", costNanos: 0, requests: 1 })).drainKeyIds)
				.toEqual([ENG_A]);
			if (!("lease" in granted)) throw new Error("expected lease");
			await coordinator.returnLeases(WORKSPACE, [{ id: granted.lease.id, usedRequests: 1, usedUnits: 0, inFlightRequests: 0 }]);
			expect(await admit(ENG_B, "b-3")).toMatchObject({ ok: true });
			// A key outside the department is never held back by it.
			expect(await admit(OUTSIDER, "o-1")).toMatchObject({ ok: true, lease: { meta: { unlimited: true } } });
		});

		it("admits across a department's keys and isolates exactly while its spend is below the budget", async () => {
			database.departments.push(engineering(1_000));
			const nodes = [isolate(ENG_A), isolate(ENG_B), isolate(ENG_A)];
			let allowed = 0;
			let denial: SpendDenial | null = null;
			for (let i = 0; i < 300 && !denial; i++) {
				const node = nodes[i % nodes.length];
				const result = await node.admit();
				if ("denial" in result) { denial = result.denial; break; }
				allowed++;
				await node.succeed(result.ticket, 7);
				await flush();
			}
			// Same rule as one key's cost limit: 142 * 7 = 994 < 1,000, so the 143rd is admitted.
			expect(allowed).toBe(143);
			expect(denial?.gate).toMatchObject({ reason: "department_daily_cost_budget_reached", currentValue: 1_001, limitValue: 1_000 });
		});

		it("ignores department budgets missing from older seeds", async () => {
			database.departments.push(engineering(1));
			database.legacyShape = true;
			database.rows.push({ requestId: "a-1", keyId: ENG_A, success: true, cost: 600, createdAt: Date.now() - 1_000 });
			expect(await checkSpendLimit({ workspaceId: WORKSPACE, keyId: ENG_A, admissionId: "a" }))
				.toMatchObject({ outcome: "allowed", admission: { unlimited: true } });
		});
	});

	describe("enforce wiring", () => {
		const API_KEY = "00000000-0000-4000-8000-000000000002";

		beforeEach(() => {
			database.keys.set(API_KEY, { workspaceId: WORKSPACE, daily: [1, 0] });
			runtime.bindings!.GATEWAY_SPEND_LIMIT_DO_MODE = "enforce";
		});

		it("falls back to the legacy check when the coordinator stalls, and frees the late admission", async () => {
			let unstall!: () => void;
			database.stall = new Promise((resolve) => { unstall = resolve; });
			vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
			try {
				const slot = createSpendLimitSlot();
				const decision = enforcedSpendLimit({ workspaceId: WORKSPACE, keyId: API_KEY, requestId: "r-stall", slot });
				await vi.advanceTimersByTimeAsync(ENFORCE_WAIT_MS);
				expect(await decision).toMatchObject({ outcome: "unavailable", error: "spend_limit_timeout" });
				expect(await slotAdmission(slot)).toBeNull();
			} finally {
				vi.useFakeTimers({ toFake: ["Date"] });
			}
			database.stall = null;
			unstall();
			await flush();
			// The late admission was released, so the key's single daily request is free again.
			expect(await checkSpendLimit({ workspaceId: WORKSPACE, keyId: API_KEY, admissionId: "r-next" })).toMatchObject({ outcome: "allowed" });
		});

		it("decides once per request slot, only in enforce mode and only for API keys", async () => {
			const slot = createSpendLimitSlot();
			const first = enforcedSpendLimit({ workspaceId: WORKSPACE, keyId: API_KEY, requestId: "r1", slot });
			expect(enforcedSpendLimit({ workspaceId: WORKSPACE, keyId: API_KEY, requestId: "r1", slot })).toBe(first);
			expect(await first).toMatchObject({ outcome: "allowed" });
			expect(database.calls).toHaveLength(1);
			expect(await slotAdmission(slot)).toMatchObject({ keyId: API_KEY, admissionId: `r1:${slot.attempt}` });
			// A fallback attempt of the same request is admitted separately.
			releaseSpend(await slotAdmission(slot));
			await flush();
			const retry = createSpendLimitSlot();
			await enforcedSpendLimit({ workspaceId: WORKSPACE, keyId: API_KEY, requestId: "r1", slot: retry });
			expect((await slotAdmission(retry))?.admissionId).toBe(`r1:${retry.attempt}`);
			releaseSpend(await slotAdmission(retry));

			expect(enforcedSpendLimit({ workspaceId: WORKSPACE, keyId: API_KEY, requestId: "r2", slot: null })).toBeNull();
			expect(enforcedSpendLimit({ workspaceId: WORKSPACE, keyId: API_KEY, requestId: "r2", slot: createSpendLimitSlot(), internal: true })).toBeNull();
			expect(enforcedSpendLimit({ workspaceId: WORKSPACE, keyId: "client_app", requestId: "r2", slot: createSpendLimitSlot() })).toBeNull();
			for (const mode of ["off", "shadow"]) {
				runtime.bindings!.GATEWAY_SPEND_LIMIT_DO_MODE = mode;
				const other = createSpendLimitSlot();
				expect(enforcedSpendLimit({ workspaceId: WORKSPACE, keyId: API_KEY, requestId: `r-${mode}`, slot: other })).toBeNull();
				expect(other.decision).toBeNull();
				expect(await slotAdmission(other)).toBeNull();
			}
		});

		it("records a charged request against its admission, and releases one that wrote no row", async () => {
			const slot = createSpendLimitSlot();
			await enforcedSpendLimit({ workspaceId: WORKSPACE, keyId: API_KEY, requestId: "r1", slot });
			const admission = await slotAdmission(slot);
			// The single daily request is in flight, so a concurrent one is turned away.
			expect(await checkSpendLimit({ workspaceId: WORKSPACE, keyId: API_KEY, admissionId: "r2" })).toMatchObject({ outcome: "denied", contended: true });
			// No row was written (e.g. a testing request): the slot is free again.
			settleEnforcedSpend({ admission, rowWritten: false, workspaceId: WORKSPACE, keyId: API_KEY, billingRequestId: "b1", requestId: "r1", costNanos: 9 });
			await flush();
			const next = await checkSpendLimit({ workspaceId: WORKSPACE, keyId: API_KEY, admissionId: "r3" });
			if (next.outcome !== "allowed") throw new Error(`expected admission: ${next.outcome}`);
			settleEnforcedSpend({ admission: next.admission, rowWritten: true, workspaceId: WORKSPACE, keyId: API_KEY, billingRequestId: "b3", requestId: "r3", costNanos: 9 });
			await flush();
			expect(await checkSpendLimit({ workspaceId: WORKSPACE, keyId: API_KEY, admissionId: "r4" })).toMatchObject({
				outcome: "denied", contended: false, keyLimit: { reason: "daily_request_limit_reached", currentValue: 1 },
			});
		});

		it("records spend without an admission in enforce mode only", async () => {
			const record = (billingRequestId: string) => settleEnforcedSpend({
				rowWritten: true, workspaceId: WORKSPACE, keyId: API_KEY, billingRequestId, requestId: billingRequestId, costNanos: 0,
			});
			runtime.bindings!.GATEWAY_SPEND_LIMIT_DO_MODE = "shadow";
			record("shadow");
			await flush();
			expect(database.calls).toHaveLength(0);
			runtime.bindings!.GATEWAY_SPEND_LIMIT_DO_MODE = "enforce";
			record("enforce");
			await flush();
			expect(await checkSpendLimit({ workspaceId: WORKSPACE, keyId: API_KEY, admissionId: "r" })).toMatchObject({
				outcome: "denied", keyLimit: { reason: "daily_request_limit_reached" },
			});
		});
	});

	describe("skipping the coordinator when nothing can be limited", () => {
		const FREE_KEY = "00000000-0000-4000-8000-000000000003";
		const NONE: SpendLimitFootprint = { keyLimited: false, softBlocked: false, workspaceBudgets: false, departmentBudgets: false, spendGuardrails: false };
		const bucket = (requestsLimit = 0, costLimitNanos = 0) => ({ windowStart: "2026-10-09T00:00:00.000Z", requestsUsed: 0, requestsLimit, costUsedNanos: 0, costLimitNanos });
		// The request context's key-limit check, as context.ts returns it.
		const contextKeyLimit = (overrides: Record<string, unknown> = {}) => ({
			ok: true, reason: null, resetAt: null, now: "2026-10-09T12:00:00.000Z",
			buckets: { daily: bucket(), weekly: bucket(), monthly: bucket() }, budgets: [], ...overrides,
		}) as never;
		let calls: { acquire: number; record: number; release: number };

		beforeEach(() => {
			database.keys.set(FREE_KEY, { workspaceId: WORKSPACE });
			runtime.bindings!.GATEWAY_SPEND_LIMIT_DO_MODE = "enforce";
			calls = { acquire: 0, record: 0, release: 0 };
			for (const method of ["acquire", "record", "release"] as const) {
				const original = coordinator[method].bind(coordinator) as (...args: unknown[]) => unknown;
				(coordinator as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => {
					calls[method] += 1;
					return original(...args);
				};
			}
		});

		const decide = (footprint: Promise<SpendLimitFootprint | null> | null, keyLimit = contextKeyLimit(), keyId = FREE_KEY) => {
			const slot = createSpendLimitSlot();
			return { slot, decision: enforcedSpendLimit({ workspaceId: WORKSPACE, keyId, requestId: "r1", slot, footprint, keyLimit })! };
		};

		it("admits without calling the coordinator, before and after the request", async () => {
			const { slot, decision } = decide(Promise.resolve(NONE));
			expect(await decision).toMatchObject({ outcome: "allowed", source: "footprint", admission: { unlimited: true, keyId: FREE_KEY } });
			const admission = await slotAdmission(slot);
			settleEnforcedSpend({ admission, rowWritten: true, workspaceId: WORKSPACE, keyId: FREE_KEY, billingRequestId: "b1", requestId: "r1", costNanos: 500 });
			releaseSpend(admission);
			settleEnforcedSpend({ admission, rowWritten: false, workspaceId: WORKSPACE, keyId: FREE_KEY, billingRequestId: "b2", requestId: "r2", costNanos: 0 });
			await flush();
			expect(calls).toEqual({ acquire: 0, record: 0, release: 0 });
			expect(database.calls).toHaveLength(0);
		});

		it("does not lose spend when a key cap is added after skipped requests", async () => {
			// Skipped requests are not recorded (as for the coordinator's own unlimited admissions):
			// their gateway_requests rows are counted when the coordinator first seeds the capped key.
			for (let index = 0; index < 3; index += 1) {
				const { slot, decision } = decide(Promise.resolve(NONE));
				await decision;
				settleEnforcedSpend({ admission: await slotAdmission(slot), rowWritten: true, workspaceId: WORKSPACE, keyId: FREE_KEY,
					billingRequestId: `b${index}`, requestId: `r${index}`, costNanos: 10 });
				database.rows.push({ requestId: `r${index}`, keyId: FREE_KEY, success: true, cost: 10, createdAt: Date.now() - 1_000 });
			}
			await flush();
			database.keys.set(FREE_KEY, { workspaceId: WORKSPACE, daily: [3, 0] });
			const { decision } = decide(Promise.resolve({ ...NONE, keyLimited: true }));
			expect(await decision).toMatchObject({ outcome: "denied", keyLimit: { reason: "daily_request_limit_reached", currentValue: 3 } });
		});

		it.each([
			["a key request cap", { keyLimited: true }, () => { database.keys.set(FREE_KEY, { workspaceId: WORKSPACE, daily: [1, 0] }); }, "daily_request_limit_reached"],
			["a key cost cap", { keyLimited: true }, () => { database.keys.set(FREE_KEY, { workspaceId: WORKSPACE, monthly: [0, 5] }); }, "monthly_cost_limit_reached"],
			["a soft block", { softBlocked: true }, () => { database.keys.set(FREE_KEY, { workspaceId: WORKSPACE, softBlocked: true }); }, "key_limit_soft_blocked"],
			["a workspace budget", { workspaceBudgets: true }, () => { database.budgets.push({ id: "wb", interval: "monthly", limit: 5 }); }, "workspace_monthly_cost_budget_reached"],
			["a department budget", { departmentBudgets: true }, () => {
				database.departments.push({ id: "db", departmentId: "d1", name: "Engineering", interval: "daily", limit: 5, keyIds: [FREE_KEY] });
			}, "department_daily_cost_budget_reached"],
			["a blocking spend guardrail", { spendGuardrails: true }, () => {
				database.guardrails.push({ guardrailId: "g1", name: "Contractors", counting: "shared", counter: "workspace:", interval: "weekly", limit: 5, keyIds: [FREE_KEY] });
			}, "guardrail_weekly_spend_limit_reached"],
		])("asks the coordinator, which enforces it, when the footprint shows %s", async (_label, footprint, configure, reason) => {
			configure();
			database.rows.push({ requestId: "used", keyId: FREE_KEY, success: true, cost: 10, createdAt: Date.now() - 1_000 });
			// The request context (possibly cached from before the limit was set) shows nothing.
			const { decision } = decide(Promise.resolve({ ...NONE, ...footprint }));
			expect(await decision).toMatchObject({ outcome: "denied", keyLimit: { reason } });
			expect(calls.acquire).toBe(1);
		});

		it.each([
			["a key cap", contextKeyLimit({ buckets: { daily: bucket(5), weekly: bucket(), monthly: bucket() } })],
			["a workspace budget", contextKeyLimit({ budgets: [{ id: "wb", interval: "monthly", limitNanos: 5 }] })],
			["a failed key-limit check", contextKeyLimit({ ok: false, reason: "daily_request_limit_reached" })],
			["no key-limit check", null],
		])("asks the coordinator when the request context shows %s", async (_label, keyLimit) => {
			const { decision } = decide(Promise.resolve(NONE), keyLimit as never);
			expect(await decision).toMatchObject({ outcome: "allowed", source: "coordinator" });
			expect(calls.acquire).toBe(1);
		});

		it("asks the coordinator when the footprint is unknown, failed or slow", async () => {
			for (const footprint of [
				Promise.resolve(null),
				Promise.reject(new Error("database unavailable")),
				new Promise<SpendLimitFootprint>(() => {}),
				null,
			]) {
				const { decision } = decide(footprint as Promise<SpendLimitFootprint | null> | null);
				expect(await decision).toMatchObject({ outcome: "allowed", source: expect.stringMatching(/^(coordinator|lease)$/) });
				releaseSpend((await decision).admission);
			}
			expect(calls.acquire).toBeGreaterThanOrEqual(1);
		});

		it("starts the footprint read only when the coordinator would be asked", async () => {
			const reads: unknown[][] = [];
			runtime.readFootprint = (...args) => { reads.push(args); return Promise.resolve(NONE); };
			try {
				expect(await startSpendLimitFootprint({ workspaceId: WORKSPACE, keyId: FREE_KEY, slot: createSpendLimitSlot() })).toEqual(NONE);
				expect(reads).toEqual([[WORKSPACE, FREE_KEY]]);
				const decided = createSpendLimitSlot();
				decided.decision = Promise.resolve({ outcome: "unavailable", keyLimit: null, admission: null, error: "x" });
				expect(startSpendLimitFootprint({ workspaceId: WORKSPACE, keyId: FREE_KEY, slot: decided })).toBeNull();
				expect(startSpendLimitFootprint({ workspaceId: WORKSPACE, keyId: FREE_KEY, slot: null })).toBeNull();
				expect(startSpendLimitFootprint({ workspaceId: WORKSPACE, keyId: FREE_KEY, slot: createSpendLimitSlot(), internal: true })).toBeNull();
				expect(startSpendLimitFootprint({ workspaceId: WORKSPACE, keyId: "client_app", slot: createSpendLimitSlot() })).toBeNull();
				runtime.bindings!.GATEWAY_SPEND_LIMIT_DO_MODE = "shadow";
				expect(startSpendLimitFootprint({ workspaceId: WORKSPACE, keyId: FREE_KEY, slot: createSpendLimitSlot() })).toBeNull();
				expect(reads).toHaveLength(1);
				// A failed read resolves to null (never rejects), so the coordinator is asked.
				runtime.bindings!.GATEWAY_SPEND_LIMIT_DO_MODE = "enforce";
				runtime.readFootprint = () => Promise.reject(new Error("database unavailable"));
				expect(await startSpendLimitFootprint({ workspaceId: WORKSPACE, keyId: FREE_KEY, slot: createSpendLimitSlot() })).toBeNull();
			} finally {
				runtime.readFootprint = () => Promise.reject(new Error("footprint read not expected"));
			}
		});
	});
});
