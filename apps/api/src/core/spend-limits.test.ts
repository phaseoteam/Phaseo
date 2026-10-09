import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
	background: [] as Promise<unknown>[],
	bindings: null as Record<string, unknown> | null,
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

import { SpendLimitDurableObject, type SpendLimitSeed } from "./spend-limit-durable-object";
import { LeasePool, type LeaseTransport } from "./lease-pool";
import {
	__resetSpendLimitsForTests,
	checkSpendLimit,
	flushSpendRecordsForTests,
	getSpendLimitMode,
	recordSpend,
	releaseSpend,
	shadowSpendLimit,
} from "./spend-limits";
import { SPEND_LEASE, type SpendDenial, type SpendLeaseMeta } from "./spend-limits.shared";

const WORKSPACE = "workspace-1";
const KEY = "key-1";
const DAY = 86_400_000;

type Row = { requestId: string; keyId: string | null; success: boolean; cost: number; createdAt: number };
type KeyConfig = { workspaceId: string; softBlocked?: boolean; daily?: [number, number]; weekly?: [number, number]; monthly?: [number, number] };
type Budget = { id: string; interval: "daily" | "weekly" | "monthly" | "lifetime"; limit: number; holds?: number };

// A JavaScript model of gateway_spend_limit_seed (the PGlite contract test pins the SQL itself).
class FakeDatabase {
	rows: Row[] = [];
	keys = new Map<string, KeyConfig>();
	budgets: Budget[] = [];
	calls: Array<{ keyIds: string[]; exclude: string[] }> = [];
	fail = false;

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
			result[window] = { requests: rows.length, cost_nanos: rows.reduce((sum, row) => sum + row.cost, 0) };
		}
		return result;
	}

	seed(workspaceId: string, keyIds: string[], exclude: string[]): SpendLimitSeed {
		this.calls.push({ keyIds: [...keyIds], exclude: [...exclude] });
		if (this.fail) throw new Error("database unavailable");
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
			const completed = this.rows.filter((row) => row.success && row.createdAt <= now && (start === null || row.createdAt >= start))
				.reduce((sum, row) => sum + row.cost, 0);
			const end = budget.interval === "daily" ? start! + DAY : budget.interval === "weekly" ? start! + 7 * DAY : null;
			return {
				id: budget.id, interval: budget.interval, limit_nanos: budget.limit, usage_nanos: completed + (budget.holds ?? 0),
				window_start: start === null ? null : iso(start), reset_at: end === null ? null : iso(end),
			};
		});
		return {
			now: iso(now), day_start: iso(windows.daily), week_start: iso(windows.weekly), month_start: iso(windows.monthly),
			keys,
			budget_status: { ok: true, budgets },
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
		return database.seed(workspaceId, keyIds, exclude);
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
		expect(database.calls.at(-1)?.exclude.sort()).toEqual(["r1", "r2"]);
		expect((await probe())?.daily).toMatchObject({ requestsUsed: 3, costUsedNanos: 1_300 });

		// r1 is now known to be persisted: the next seed counts it instead of excluding it.
		database.rows.push({ requestId: "r2", keyId: KEY, success: true, cost: 200, createdAt: Date.now() });
		vi.setSystemTime(Date.now() + SPEND_LEASE.reseedMs + 1);
		await probe();
		await flush();
		expect(database.calls.at(-1)?.exclude).toEqual(["r2"]);
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
});
