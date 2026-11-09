// Spend the coordinator counts from memory and its handoff to the seed: stepped charges, seed
// transitions, period boundaries and bounds (spend-limit-held.ts states the invariants).
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

import { SpendLimitDurableObject } from "./spend-limit-durable-object";
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
import { DAY, FakeDatabase, KEY, TestSpendLimitDurableObject, WORKSPACE, sqliteState, tick, type GuardrailCounter } from "./spend-limits.testkit";

let sqlite: DatabaseSync;
let database: FakeDatabase;
let coordinator: SpendLimitDurableObject;

function createCoordinator(): SpendLimitDurableObject {
	return new TestSpendLimitDurableObject(sqliteState(sqlite), {} as never, database);
}

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

describe("spend-limit coordinator handoffs", () => {
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
			// The final refunds to $1 and settles the request as a success. Its cost cannot lower what the
			// seed took over (the refund is a ledger movement the next seed counts); its success counts
			// from memory until a seed read after it.
			debit("b-unaudited", 100);
			expect(await coordinator.record(WORKSPACE, { ...entry("b-unaudited"), costNanos: 100, final: true })).toMatchObject({ duplicates: 0 });
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
			const internals = (coordinator as unknown as { held: { entries: Map<string, { phase: string; reason?: string; billingRequestId: string }>; aggregate: Map<string, unknown>; remembered: Map<string, unknown>; remember(entry: unknown): void } }).held;
			await checkpoint("b-forgot", 300, 1);
			vi.setSystemTime(Date.now() + SPEND_LEASE.pendingTtlMs + 1);
			await reseed();
			expect(internals.remembered.has("b-forgot")).toBe(true);
			// Forgotten (the record is bounded): the late total counts whole, over the seed's $3 ...
			internals.remembered.delete("b-forgot");
			await checkpoint("b-forgot", 400, 2);
			expect(await daily()).toBe(700);
			// ... until seeds read after it count the charge row alone.
			await reseed();
			await reseed();
			expect(await daily()).toBe(400);
			// The record of handed-off totals stays bounded, oldest forgotten first.
			for (let n = 0; n < 10_005; n += 1) internals.remember({ billingRequestId: `h-${n}`, keyId: KEY, cost: { total: 1 }, requests: { total: 0 } });
			expect(internals.remembered.size).toBe(10_000);
			expect(internals.remembered.has("h-0")).toBe(false);
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
			expect((coordinator as unknown as { held: { entries: Map<string, { phase: string; reason?: string; billingRequestId: string }>; aggregate: Map<string, unknown>; remembered: Map<string, unknown>; remember(entry: unknown): void } }).held.entries.has("bill-after")).toBe(false);
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
		const overflowed = () => [...(coordinator as unknown as { held: { entries: Map<string, { phase: string; reason?: string; billingRequestId: string }>; aggregate: Map<string, unknown>; remembered: Map<string, unknown>; remember(entry: unknown): void } }).held.entries.values()]
			.find((entry) => entry.reason === "overflow")!.billingRequestId;

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
			held: { entries: Map<string, unknown>; aggregate: Map<string, unknown> }; seed: { windows: Record<"daily", number> };
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
			expect(internals.held.entries.size).toBeLessThanOrEqual(2_500);
			expect(internals.held.aggregate.size).toBe(1);
			expect(internals.keyUsage(KEY, "daily", internals.seed.windows).cost).toBe(round * 3_000);
		}
		// The database recovers: the seed counts the charges, and memory lets them go.
		database.fail = false;
		await internals.reseed(null);
		expect(internals.held.entries.size).toBe(0);
		expect(internals.held.aggregate.size).toBe(0);
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
});
