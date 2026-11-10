// Round-8 findings on the held-spend ledger and lease holds (spend-limit-held.ts states the
// invariants these tests check: never under-count, a bounded over-count, bounded memory).
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

import { HeldSpend, MAX_AGGREGATE_KEYS, MAX_HANDOFF_ENTRIES, WORKSPACE_AGGREGATE } from "./spend-limit-held";

const held = () => (coordinator as unknown as { held: HeldSpend }).held;
const internals = () => coordinator as unknown as {
	reseed(key: string | null): Promise<void>;
	keyHolds(key: string, window: "daily", windows: unknown): { requests: number };
	seed: { windows: unknown };
	leases: Map<string, unknown>;
	holdOf(lease: unknown): { requests: number };
};
const reseed = () => internals().reseed(KEY);
const heldRequests = () => internals().keyHolds(KEY, "daily", internals().seed.windows).requests;
const stepped = (id: string, total: number, rest: Record<string, unknown> = {}) => coordinator.record(WORKSPACE, {
	keyId: KEY, billingRequestId: id, requestId: `req-${id}`, costNanos: total, requests: 1, replace: true, revision: 1, ...rest,
});
const denied = async (admissionId: string) => {
	const result = await coordinator.acquire(WORKSPACE, KEY, { requests: 1, units: 0 }, { requests: 1, units: 0 }, [], admissionId);
	return "denial" in result && Boolean(result.denial);
};

describe("held-spend ledger", () => {
	it("counts a successful final that arrives after its checkpoints were handed off as a successful request", async () => {
		database.keys.set(KEY, { workspaceId: WORKSPACE, daily: [1, 1_000_000] });
		await probe();
		database.charges.push({ billingId: "late-final", keyId: KEY, total: 300, at: Date.now() });
		await stepped("late-final", 300);
		// Handed off before its audit row exists: the seed counts its $3 and 0 successful requests.
		vi.setSystemTime(Date.now() + SPEND_LEASE.pendingTtlMs + 1);
		await reseed();
		expect((await probe())?.daily.requestsUsed).toBe(0);
		// The stream then succeeds: its audit row lands and its final reports the same $3.
		database.rows.push({ requestId: "req-late-final", billingId: "late-final", keyId: KEY, success: true, cost: 300, createdAt: Date.now() });
		await stepped("late-final", 300, { final: true });
		// The success counts at once against the 1-request cap, and after the seed takes it over.
		expect(await denied("after-success")).toBe(true);
		await reseed();
		expect(await denied("after-seed")).toBe(true);
		expect((await probe())?.daily).toMatchObject({ requestsUsed: 1, costUsedNanos: 300 });
	});

	it("keeps another request's hold when a lease return reaches the coordinator before a failed request's final", async () => {
		// Requests A and B share one slice of the real isolate pool. A is charged at a checkpoint, then
		// fails and settles locally; the pool returns the slice (B still in flight) before A's final.
		database.keys.set(KEY, { workspaceId: WORKSPACE, daily: [10, 0] });
		const pool = new LeasePool<SpendLeaseMeta, SpendDenial>({ unitsMode: "precheck", topUpAt: 1 });
		const transport: LeaseTransport<SpendLeaseMeta, SpendDenial> = {
			acquire: (need, want, returns) => coordinator.acquire(WORKSPACE, KEY, need, want, returns, "pool-A"),
			returnLeases: (returns) => coordinator.returnLeases(WORKSPACE, returns),
		};
		const a = await pool.admit("A", { requests: 1, units: 0 }, transport);
		const b = await pool.admit("B", { requests: 1, units: 0 }, transport);
		if (!("ticket" in a) || !("ticket" in b) || a.ticket.leaseId !== b.ticket.leaseId) throw new Error("expected one shared slice");
		expect(pool.settle(a.ticket, { requests: 0, units: 300 }, { final: false })).toBe(true);
		await stepped("pool-A", 300, { leaseId: a.ticket.leaseId });
		vi.setSystemTime(Date.now() + SPEND_LEASE.ttlMs + 1);
		expect(pool.settle(a.ticket, { requests: -1, units: 0 })).toBe(true);
		pool.flushReturns(transport);
		await tick();
		await stepped("pool-A", 300, { leaseId: a.ticket.leaseId, final: true, requests: 0 });
		expect(heldRequests()).toBe(1);
	});

	it("keeps another request's hold when the returned counts already left the failed request out", async () => {
		database.keys.set(KEY, { workspaceId: WORKSPACE, daily: [10, 0] });
		const granted = await coordinator.acquire(WORKSPACE, KEY, { requests: 1, units: 0 }, { requests: 10, units: 0 }, [], "stream-local");
		if (!("lease" in granted) || !granted.lease.expiresAt) throw new Error("expected a reusable slice");
		const leaseId = granted.lease.id;
		await stepped("stream-local", 300, { leaseId });
		// The return counts only B (A failed and was settled in the isolate), before A's final.
		await coordinator.returnLeases(WORKSPACE, [{ id: leaseId, usedRequests: 1, usedUnits: 300, inFlightRequests: 1 }]);
		await stepped("stream-local", 300, { leaseId, final: true, requests: 0 });
		expect(heldRequests()).toBe(1);
	});

	it("frees only the failed request's slot when its final releases it after a return that still counted it", async () => {
		database.keys.set(KEY, { workspaceId: WORKSPACE, daily: [10, 0] });
		const granted = await coordinator.acquire(WORKSPACE, KEY, { requests: 1, units: 0 }, { requests: 10, units: 0 }, [], "stream");
		if (!("lease" in granted) || !granted.lease.expiresAt) throw new Error("expected a reusable slice");
		await stepped("stream", 300, { leaseId: granted.lease.id });
		// The slice comes back with the stream and one other request still in flight.
		await coordinator.returnLeases(WORKSPACE, [{ id: granted.lease.id, usedRequests: 2, usedUnits: 300, inFlightRequests: 2 }]);
		await stepped("stream", 300, { leaseId: granted.lease.id, final: true, requests: 0, releaseAdmissionId: "stream" });
		const lease = internals().leases.get(granted.lease.id);
		expect(lease && internals().holdOf(lease).requests).toBe(1);
	});

	it("keeps memory bounded while a seed stalls and late records keep arriving, without losing their spend", async () => {
		await probe();
		const ledger = held() as unknown as { markSeen(id: string): void; remember(entry: unknown): void };
		for (let n = 0; n < 5_000; n += 1) {
			ledger.markSeen(`late-${n}`);
			ledger.remember({ billingRequestId: `late-${n}`, keyId: KEY, cost: { total: 1 }, requests: { total: 0 } });
		}
		let resume!: () => void;
		database.stall = new Promise<void>((resolve) => { resume = resolve; });
		const loading = reseed();
		await tick();
		for (let n = 0; n < 5_000; n += 1) await stepped(`late-${n}`, 2, { revision: 2 });
		expect(held().entries.size).toBeLessThanOrEqual(MAX_HANDOFF_ENTRIES);
		// Every $0.01 increase still counts (5,000), from entries or the aggregate.
		expect(held().cost(null)).toBe(5_000);
		database.stall = null;
		resume();
		await loading;
	});

	it("keeps the aggregate bounded across many keys while seeds fail, without losing their spend", async () => {
		await probe();
		database.fail = true;
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		for (let round = 1; round <= 2; round += 1) {
			for (let batch = 0; batch < 60; batch += 1) {
				await coordinator.record(WORKSPACE, Array.from({ length: 100 }, (_, n) => {
					const id = `churn-${round}-${batch}-${n}`;
					return { keyId: id, billingRequestId: id, requestId: `req-${id}`, costNanos: 1, requests: 0 };
				}));
			}
			await flush();
			vi.setSystemTime(Date.now() + SPEND_LEASE.pendingTtlMs + 1);
			await reseed().catch(() => undefined);
			expect(held().aggregate.size).toBeLessThanOrEqual(MAX_AGGREGATE_KEYS + 1);
			expect(held().entries.size).toBeLessThanOrEqual(MAX_HANDOFF_ENTRIES);
			for (const segments of held().aggregate.values()) expect((segments as unknown[]).length).toBeLessThanOrEqual(4);
			expect(held().cost(null)).toBe(round * 6_000);
		}
		expect(held().aggregate.has(WORKSPACE_AGGREGATE)).toBe(true);
		warn.mockRestore();
	});

	it("lets a seed take over aggregated spend read before it, keeping only what came after", async () => {
		await probe();
		// Old-period spend folded into the aggregate; a record for the folded id arrives during every read.
		database.charges.push({ billingId: "folded", keyId: KEY, total: 300, at: Date.now() });
		(held() as unknown as { aggregate: Map<string, unknown> }).aggregate.set(KEY, [{ cost: 300, requests: 0, seq: 0 }]);
		(held() as unknown as { markSeen(id: string): void }).markSeen("folded");
		vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
		database.afterRead = async () => { await stepped("folded", 300, { revision: 2 }); };
		for (let n = 0; n < 3; n += 1) await reseed();
		database.afterRead = null;
		// Today's spend is 0 in the database; memory keeps at most the latest unconfirmed $3.
		expect(held().keyUsage(KEY, Date.parse("2026-10-10T00:00:00Z")).cost).toBeLessThanOrEqual(300);
		await reseed();
		expect(held().keyUsage(KEY, Date.parse("2026-10-10T00:00:00Z")).cost).toBe(0);
	});

	it("counts a later increase after a late increase was folded into the aggregate", async () => {
		await probe();
		database.charges.push({ billingId: "delta", keyId: KEY, total: 300, at: Date.now() });
		await stepped("delta", 300);
		vi.setSystemTime(Date.now() + SPEND_LEASE.pendingTtlMs + 1);
		await reseed();
		database.charges.push({ billingId: "delta", keyId: KEY, total: 100, at: Date.now() });
		await stepped("delta", 400, { revision: 2 });
		// 2,500 newer handoff entries push the $1 late increase into the aggregate.
		for (let n = 0; n < MAX_HANDOFF_ENTRIES; n += 1) {
			held().entries.set(`dummy-${n}`, {
				billingRequestId: `dummy-${n}`, requestId: `req-dummy-${n}`, keyId: KEY, at: Date.now(), costAt: Date.now(), requestsAt: Date.now(), recordedAt: Date.now() + 1,
				cost: { total: 0, base: 0, seq: 1 }, requests: { total: 0, base: 0, seq: 1 }, phase: "handoff", reason: "late",
			});
		}
		held().enforceBounds();
		expect(held().entries.has("delta")).toBe(false);
		await reseed();
		database.charges.push({ billingId: "delta", keyId: KEY, total: 50, at: Date.now() });
		await stepped("delta", 450, { revision: 3 });
		expect((await probe())?.daily.costUsedNanos).toBeGreaterThanOrEqual(450);
	});

	it.each([
		["day", "daily", "2026-10-09T23:59:50Z", "2026-10-10T00:00:10Z"],
		["week", "weekly", "2026-10-11T23:59:50Z", "2026-10-12T00:00:10Z"],
		["month", "monthly", "2026-10-31T23:59:50Z", "2026-11-01T00:00:10Z"],
	] as const)("counts a same-cost successful final in its new %s", async (_label, window, before, after) => {
		vi.setSystemTime(new Date(before));
		await probe();
		database.charges.push({ billingId: "boundary-success", keyId: KEY, total: 300, at: Date.now() });
		await stepped("boundary-success", 300, { requests: 0 });
		vi.setSystemTime(new Date(after));
		// During the new period's seed read, the success row lands and the final reports the same $3.
		database.afterRead = async () => {
			database.afterRead = null;
			database.rows.push({ requestId: "req-boundary-success", billingId: "boundary-success", keyId: KEY, success: true, cost: 300, createdAt: Date.now() });
			await stepped("boundary-success", 300, { final: true, requests: 1 });
		};
		await reseed();
		expect((await probe())?.[window].requestsUsed).toBeGreaterThanOrEqual(1);
		await reseed();
		expect((await probe())?.[window].requestsUsed).toBe(1);
	});

	it("does not count a replayed total again each time its entry folds", () => {
		const ledger = new HeldSpend();
		let now = Date.now();
		const record = (id: string, cost: number, replace: boolean) => ledger.record({
			keyId: KEY, billingRequestId: id, requestId: `req-${id}`, costNanos: cost, requests: 0, ...(replace ? { replace: true, revision: 2 } : {}),
		}, now);
		record("replayed", 300, true);
		now += SPEND_LEASE.pendingTtlMs + 1;
		ledger.markStale(now);
		ledger.publish(ledger.beginRead(), new Set(), new Set());
		expect(ledger.remembered.get("replayed")).toMatchObject({ cost: 300 });
		// The same $4 total arrives again in each of ten rounds, between which its entry folds.
		for (let round = 0; round < 10; round += 1) {
			now += 1;
			record("replayed", 400, true);
			ledger.enforceBounds();
			for (let n = 0; n < MAX_HANDOFF_ENTRIES; n += 1) {
				record(`filler-${round}-${n}`, 0, false);
				if (n % 100 === 99) ledger.enforceBounds();
			}
			now += SPEND_LEASE.pendingTtlMs + 1;
			ledger.markStale(now);
			ledger.enforceBounds();
		}
		// Only the $1 increase is outstanding.
		expect(ledger.cost(null)).toBe(100);
	});

	it("keeps every aggregate segment counted when the list is full, until a covering read publishes", () => {
		const ledger = new HeldSpend();
		const fold = (amount: number) => (ledger as unknown as { addAggregate(key: string, cost: number, requests: number): void }).addAggregate(KEY, amount, 1);
		let total = 0;
		for (let n = 1; n <= 6; n += 1) {
			ledger.beginRead();
			fold(n);
			total += n;
		}
		expect(ledger.aggregate.get(KEY)?.length).toBe(4);
		expect(ledger.keyUsage(KEY, 0)).toEqual({ cost: total, requests: 6 });
		ledger.publish(1, new Set(), new Set());
		expect(ledger.keyUsage(KEY, 0).cost).toBe(total);
		const fresh = ledger.beginRead();
		fold(7);
		ledger.publish(fresh, new Set(), new Set());
		expect(ledger.keyUsage(KEY, 0)).toEqual({ cost: 7, requests: 1 });
	});

	it("charges each key at most the workspace-wide overflow, and only until a seed", () => {
		const ledger = new HeldSpend();
		const fold = (key: string) => (ledger as unknown as { addAggregate(key: string, cost: number, requests: number): void }).addAggregate(key, 10, 1);
		for (let n = 0; n < 100; n += 1) fold(`key-${n}`);
		ledger.enforceBounds();
		expect(ledger.aggregate.size).toBeLessThanOrEqual(MAX_AGGREGATE_KEYS + 1);
		expect(ledger.cost(null)).toBe(1_000);
		expect(ledger.keyUsage("innocent", 0)).toEqual({ cost: 360, requests: 36 });
		expect(ledger.keyUsage("key-0", 0)).toEqual({ cost: 370, requests: 37 });
		ledger.publish(ledger.beginRead(), new Set(), new Set());
		expect(ledger.keyUsage("innocent", 0)).toEqual({ cost: 0, requests: 0 });
	});

	it("serializes concurrent seeds and keeps a change made while they load until a covering read", async () => {
		await probe();
		await stepped("seed-race", 100);
		database.charges.push({ billingId: "seed-race", keyId: KEY, total: 100, at: Date.now() });
		let resume!: () => void;
		database.stall = new Promise<void>((resolve) => { resume = resolve; });
		const first = reseed();
		const second = reseed();
		await tick();
		await stepped("seed-race", 150, { revision: 2 });
		database.charges.push({ billingId: "seed-race", keyId: KEY, total: 50, at: Date.now() });
		database.stall = null;
		resume();
		await Promise.all([first, second]);
		expect((await probe())?.daily.costUsedNanos).toBeGreaterThanOrEqual(150);
	});

	it("after a restart during a read, seeds committed spend and keeps persisted lease holds", async () => {
		await probe();
		const grant = await coordinator.acquire(WORKSPACE, KEY, { requests: 1, units: 0 }, { requests: 10, units: 0 }, [], "restart");
		if (!("lease" in grant)) throw new Error("expected a slice");
		let resume!: () => void;
		database.stall = new Promise<void>((resolve) => { resume = resolve; });
		const loading = reseed();
		await tick();
		database.charges.push({ billingId: "restart-charge", keyId: KEY, total: 300, at: Date.now() });
		coordinator = createCoordinator();
		database.stall = null;
		resume();
		await loading;
		expect((await probe())?.daily.costUsedNanos).toBeGreaterThanOrEqual(300);
		expect(heldRequests()).toBeGreaterThanOrEqual(grant.lease.requests ?? 0);
	});
});
