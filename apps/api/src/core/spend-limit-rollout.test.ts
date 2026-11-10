// Mixed versions on every deploy: the SpendLimit object is hosted by one Worker and called from
// others deployed separately. These run this branch against main's real code in both directions.
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
	spendRecordsWaitingForTests,
	shadowSpendLimit,
	shadowSpendLimitOnce,
	slotAdmission,
	startSpendLimitFootprint,
} from "./spend-limits";
import type { SpendLimitFootprint } from "./spend-limit-footprint";
import { SPEND_LEASE, type SpendDenial, type SpendLeaseMeta } from "./spend-limits.shared";
import { MAX_BATCH, MAX_PENDING, RECORD_TIMEOUT_MS } from "./spend-limit-sender";
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

import { SpendLimitDurableObject as MainCoordinator } from "./__fixtures__/main-spend-limits/spend-limit-durable-object";
import * as mainIsolate from "./__fixtures__/main-spend-limits/spend-limits";

/** main's coordinator, reading the same fake seed. */
class OldCoordinator extends MainCoordinator {
	constructor(state: DurableObjectState, private readonly db: FakeDatabase) {
		super(state, {} as never);
	}

	protected override async loadSeed(workspaceId: string, keyIds: string[], exclude: string[]): Promise<never> {
		return this.db.seed(workspaceId, keyIds, exclude) as never;
	}
}

const CAPPED = "00000000-0000-4000-8000-000000000031";
const enforce = (target: unknown) => {
	runtime.bindings = { SPEND_LIMITS: { getByName: () => target }, GATEWAY_SPEND_LIMIT_DO_MODE: "enforce" };
};

describe("this isolate with main's coordinator", () => {
	let old: OldCoordinator;
	beforeEach(() => {
		old = new OldCoordinator(sqliteState(sqlite), database);
		enforce(old);
	});

	it("adds up checkpoints, so a cost cap is enforced", async () => {
		database.keys.set(CAPPED, { workspaceId: WORKSPACE, daily: [10, 400] });
		const first = await checkSpendLimit({ workspaceId: WORKSPACE, keyId: CAPPED, admissionId: "stream" });
		if (first.outcome !== "allowed") throw new Error("expected admission");
		const args = { admission: first.admission, workspaceId: WORKSPACE, keyId: CAPPED, billingRequestId: "bill-stream", requestId: "stream" };
		recordCheckpointSpend({ ...args, costNanos: 100, revision: 1 });
		await flush();
		recordCheckpointSpend({ ...args, costNanos: 450, revision: 2 });
		await flush();
		const result = await old.acquire(WORKSPACE, CAPPED, { requests: 1, units: 0 }, { requests: 1, units: 0 }, [], "after");
		expect("denial" in result && result.denial?.gate).toMatchObject({ reason: "daily_cost_limit_reached", currentValue: 450 });
	});

	it("records a charged cancellation's cost, then frees its slot", async () => {
		database.keys.set(CAPPED, { workspaceId: WORKSPACE, daily: [1, 1_000_000] });
		const calls: string[] = [];
		const record = old.record.bind(old);
		const release = old.release.bind(old);
		old.record = async (...args) => { calls.push("record"); return record(...args); };
		old.release = async (...args) => { calls.push("release"); return release(...args); };
		const first = await checkSpendLimit({ workspaceId: WORKSPACE, keyId: CAPPED, admissionId: "cancel" });
		if (first.outcome !== "allowed") throw new Error("expected admission");
		settleEnforcedSpend({ admission: first.admission, rowWritten: true, workspaceId: WORKSPACE, keyId: CAPPED,
			billingRequestId: "bill-cancel", requestId: "cancel", costNanos: 100, requests: 0, replace: true });
		await flush();
		expect(calls).toEqual(["record", "release"]);
		const next = await checkSpendLimit({ workspaceId: WORKSPACE, keyId: CAPPED, admissionId: "next" });
		expect(next.outcome).toBe("allowed");
		expect(next.keyLimit?.buckets?.daily).toMatchObject({ requestsUsed: 0, costUsedNanos: 100 });
	});
});

describe("a coordinator rolled back, and protocol-1 settlement", () => {
	it("sends a batch again as additive increases when the coordinator answering it was rolled back", async () => {
		database.keys.set(CAPPED, { workspaceId: WORKSPACE, daily: [10, 400] });
		// The isolate learns protocol 2 from this branch's coordinator ...
		enforce(coordinator);
		const first = await checkSpendLimit({ workspaceId: WORKSPACE, keyId: CAPPED, admissionId: "rollback" });
		if (first.outcome !== "allowed") throw new Error("expected admission");
		// ... then the hosting Worker is rolled back to main.
		const old = new OldCoordinator(sqliteState(sqlite), database);
		await old.acquire(WORKSPACE, CAPPED, { requests: 0, units: 0 }, { requests: 0, units: 0 }, [], "seed-old");
		enforce(old);
		const args = { admission: first.admission, workspaceId: WORKSPACE, keyId: CAPPED, billingRequestId: "rollback-bill", requestId: "rollback" };
		recordCheckpointSpend({ ...args, costNanos: 100, revision: 1 });
		recordCheckpointSpend({ ...args, costNanos: 450, revision: 2 });
		await flush();
		// main kept the first record ($1) and ignored the replacement; the resend adds $4.50 (an over-count).
		const result = await old.acquire(WORKSPACE, CAPPED, { requests: 1, units: 0 }, { requests: 1, units: 0 }, [], "after");
		expect("denial" in result && result.denial?.gate).toMatchObject({ reason: "daily_cost_limit_reached" });
		expect(("denial" in result && Number(result.denial?.gate.currentValue)) || 0).toBeGreaterThanOrEqual(450);
	});

	it("does not release a final's slot before an earlier checkpoint is acknowledged by main's coordinator", async () => {
		database.keys.set(CAPPED, { workspaceId: WORKSPACE, daily: [1, 80] });
		const old = new OldCoordinator(sqliteState(sqlite), database);
		let resume!: () => void;
		const stalled = new Promise<void>((resolve) => { resume = resolve; });
		const calls: string[] = [];
		const record = old.record.bind(old);
		const release = old.release.bind(old);
		old.record = async (...args) => {
			calls.push("record");
			if (calls.length === 1) await stalled;
			return record(...args);
		};
		old.release = async (...args) => { calls.push("release"); return release(...args); };
		enforce(old);
		const first = await checkSpendLimit({ workspaceId: WORKSPACE, keyId: CAPPED, admissionId: "stalled" });
		if (first.outcome !== "allowed") throw new Error("expected admission");
		const args = { admission: first.admission, workspaceId: WORKSPACE, keyId: CAPPED, billingRequestId: "stalled-bill", requestId: "stalled" };
		// The $1 checkpoint's batch stalls before main applies it; the charged failure then settles at $1.
		recordCheckpointSpend({ ...args, costNanos: 100, revision: 1 });
		const checkpointFlush = flushSpendRecordsForTests();
		await tick();
		settleEnforcedSpend({ ...args, costNanos: 100, rowWritten: true, requests: 0, replace: true });
		const finalFlush = flushSpendRecordsForTests();
		await tick();
		// The slot is still held, so no admission passes with the $1 uncounted.
		const during = await old.acquire(WORKSPACE, CAPPED, { requests: 1, units: 0 }, { requests: 1, units: 0 }, [], "during");
		expect("denial" in result(during)).toBe(true);
		resume();
		await Promise.all([checkpointFlush, finalFlush]);
		expect(calls).toEqual(["record", "record", "release"]);
		const after = await old.acquire(WORKSPACE, CAPPED, { requests: 1, units: 0 }, { requests: 1, units: 0 }, [], "after");
		expect("denial" in after && after.denial?.gate).toMatchObject({ reason: "daily_cost_limit_reached", currentValue: 100 });
	});
});

function result<T>(value: T): T {
	return value;
}

describe("record delivery", () => {
	/** The coordinator's view of a key's daily cost (refused admissions report it too). */
	const dailyCost = async (target: { acquire: SpendLimitDurableObject["acquire"] }, keyId: string) => {
		const result = await target.acquire(WORKSPACE, keyId, { requests: 1, units: 0 }, { requests: 1, units: 0 }, [], `peek-${Math.random()}`);
		return "lease" in result ? result.lease.meta.buckets?.daily.costUsedNanos : result.denial?.gate.buckets?.daily.costUsedNanos;
	};

	it.each(["this branch's", "main's"] as const)("delivers all 150 records queued behind a stalled call to %s coordinator, 100 at a time", async (version) => {
		const target = version === "main's" ? new OldCoordinator(sqliteState(sqlite), database) : coordinator;
		database.keys.set(CAPPED, { workspaceId: WORKSPACE, daily: [1_000, 140] });
		enforce(target);
		await checkSpendLimit({ workspaceId: WORKSPACE, keyId: CAPPED, admissionId: "learn" });
		let resume!: () => void;
		const stalled = new Promise<void>((resolve) => { resume = resolve; });
		const record = target.record.bind(target);
		const sizes: number[] = [];
		target.record = async (...args: Parameters<typeof record>) => {
			sizes.push(Array.isArray(args[1]) ? args[1].length : 1);
			if (sizes.length === 1) await stalled;
			return record(...args);
		};
		recordSpend({ workspaceId: WORKSPACE, keyId: CAPPED, billingRequestId: "starter", requestId: "starter", costNanos: 0, requests: 0 });
		const first = flushSpendRecordsForTests();
		await tick();
		for (let n = 0; n < 150; n += 1) {
			database.rows.push({ requestId: `req-${n}`, billingId: `bill-${n}`, keyId: CAPPED, success: true, cost: 1, createdAt: Date.now() });
			recordSpend({ workspaceId: WORKSPACE, keyId: CAPPED, billingRequestId: `bill-${n}`, requestId: `req-${n}`, costNanos: 1 });
		}
		const drained = flushSpendRecordsForTests();
		await tick();
		resume();
		await Promise.all([first, drained]);
		expect(Math.max(...sizes)).toBeLessThanOrEqual(MAX_BATCH);
		// All $1.50 counted against the $1.40 cap: refused.
		const result = await target.acquire(WORKSPACE, CAPPED, { requests: 1, units: 0 }, { requests: 1, units: 0 }, [], "after");
		expect("denial" in result && result.denial?.gate.currentValue).toBe(150);
	});

	it("releases a protocol-1 cancellation at the tail of a long queue only after its cost is recorded", async () => {
		const target = new OldCoordinator(sqliteState(sqlite), database);
		enforce(target);
		database.keys.set(CAPPED, { workspaceId: WORKSPACE, daily: [1, 80] });
		const first = await checkSpendLimit({ workspaceId: WORKSPACE, keyId: CAPPED, admissionId: "cancel" });
		if (first.outcome !== "allowed") throw new Error("expected admission");
		let resume!: () => void;
		const stalled = new Promise<void>((resolve) => { resume = resolve; });
		const record = target.record.bind(target);
		let calls = 0;
		target.record = async (...args: Parameters<typeof record>) => {
			if (++calls === 1) await stalled;
			return record(...args);
		};
		recordSpend({ workspaceId: WORKSPACE, keyId: CAPPED, billingRequestId: "starter", requestId: "starter", costNanos: 0, requests: 0 });
		const pending = flushSpendRecordsForTests();
		await tick();
		for (let n = 0; n < 100; n += 1) recordSpend({ workspaceId: WORKSPACE, keyId: KEY, billingRequestId: `fill-${n}`, requestId: `fill-${n}`, costNanos: 0, requests: 0 });
		database.charges.push({ billingId: "cancel-bill", keyId: CAPPED, total: 100, at: Date.now() });
		settleEnforcedSpend({ admission: first.admission, workspaceId: WORKSPACE, keyId: CAPPED, billingRequestId: "cancel-bill", requestId: "cancel",
			costNanos: 100, requests: 0, replace: true, rowWritten: true });
		const drained = flushSpendRecordsForTests();
		await tick();
		resume();
		await Promise.all([pending, drained]);
		const result = await target.acquire(WORKSPACE, CAPPED, { requests: 1, units: 0 }, { requests: 1, units: 0 }, [], "after-cancel");
		expect("denial" in result && result.denial?.gate).toMatchObject({ reason: "daily_cost_limit_reached", currentValue: 100 });
	});

	it("sends a final in full after its checkpoint's call failed, before releasing the slot", async () => {
		const target = new OldCoordinator(sqliteState(sqlite), database);
		enforce(target);
		database.keys.set(CAPPED, { workspaceId: WORKSPACE, daily: [1, 80] });
		const first = await checkSpendLimit({ workspaceId: WORKSPACE, keyId: CAPPED, admissionId: "reject" });
		if (first.outcome !== "allowed") throw new Error("expected admission");
		const record = target.record.bind(target);
		let calls = 0;
		target.record = async (...args: Parameters<typeof record>) => {
			if (++calls === 1) throw new Error("rpc rejected");
			return record(...args);
		};
		const args = { admission: first.admission, workspaceId: WORKSPACE, keyId: CAPPED, billingRequestId: "reject-bill", requestId: "reject" };
		recordCheckpointSpend({ ...args, costNanos: 100, revision: 1 });
		await flushSpendRecordsForTests();
		settleEnforcedSpend({ ...args, costNanos: 100, requests: 0, replace: true, rowWritten: true });
		await flushSpendRecordsForTests();
		const result = await target.acquire(WORKSPACE, CAPPED, { requests: 1, units: 0 }, { requests: 1, units: 0 }, [], "after-reject");
		expect("denial" in result && result.denial?.gate.currentValue).toBe(100);
	});

	it("keeps the backlog bounded and recovers when a call to the coordinator hangs for an hour", async () => {
		vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
		vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
		enforce(coordinator);
		await checkSpendLimit({ workspaceId: WORKSPACE, keyId: KEY, admissionId: "learn" });
		const record = coordinator.record.bind(coordinator);
		let calls = 0;
		coordinator.record = async (...args: Parameters<typeof record>) => {
			// The first call never answers.
			if (++calls === 1) return new Promise<never>(() => undefined);
			return record(...args);
		};
		recordSpend({ workspaceId: WORKSPACE, keyId: KEY, billingRequestId: "staller", requestId: "staller", costNanos: 0, requests: 0 });
		void flushSpendRecordsForTests();
		await tick();
		for (let n = 0; n < 20_000; n += 1) {
			database.charges.push({ billingId: `outage-${n}`, keyId: KEY, total: 1, at: Date.now() });
			recordSpend({ workspaceId: WORKSPACE, keyId: KEY, billingRequestId: `outage-${n}`, requestId: `outage-${n}`, costNanos: 1, requests: 0 });
		}
		// Bounded: past MAX_PENDING the oldest fold into one aggregate record for the key.
		expect(spendRecordsWaitingForTests(WORKSPACE)).toBeLessThanOrEqual(MAX_PENDING + 1);
		await vi.advanceTimersByTimeAsync(RECORD_TIMEOUT_MS);
		await vi.advanceTimersByTimeAsync(3_600_000);
		expect(calls).toBeGreaterThan(1);
		expect(spendRecordsWaitingForTests(WORKSPACE)).toBe(0);
		// Nothing dropped: once delivered and taken over by the seed, all $200 the database holds count.
		expect((await probe())?.monthly.costUsedNanos).toBe(20_000);
	});

	it("never makes an admission wait on record delivery", async () => {
		enforce(coordinator);
		await checkSpendLimit({ workspaceId: WORKSPACE, keyId: KEY, admissionId: "learn" });
		let resume!: () => void;
		const stalled = new Promise<void>((resolve) => { resume = resolve; });
		const record = coordinator.record.bind(coordinator);
		coordinator.record = async (...args: Parameters<typeof record>) => { await stalled; return record(...args); };
		recordSpend({ workspaceId: WORKSPACE, keyId: KEY, billingRequestId: "staller", requestId: "staller", costNanos: 0, requests: 0 });
		const pending = flushSpendRecordsForTests();
		await tick();
		const admitted = await Promise.race([
			checkSpendLimit({ workspaceId: WORKSPACE, keyId: KEY, admissionId: "parallel" }),
			new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 50)),
		]);
		resume();
		await pending;
		expect(admitted).not.toBe("timeout");
	});

	it("clears a fresh isolate's protocol-1 over-count once the audit row is seeded", async () => {
		const target = new OldCoordinator(sqliteState(sqlite), database);
		enforce(target);
		database.keys.set(CAPPED, { workspaceId: WORKSPACE, daily: [100, 1_000] });
		const first = await checkSpendLimit({ workspaceId: WORKSPACE, keyId: CAPPED, admissionId: "restart" });
		if (first.outcome !== "allowed") throw new Error("expected admission");
		const args = { workspaceId: WORKSPACE, keyId: CAPPED, billingRequestId: "restart-bill", requestId: "restart" };
		recordCheckpointSpend({ ...args, costNanos: 100, revision: 1 });
		await flushSpendRecordsForTests();
		// A new isolate (nothing acknowledged) settles the final: it sends the whole $1.50.
		__resetSpendLimitsForTests();
		recordSpend({ ...args, costNanos: 150, replace: true });
		await flushSpendRecordsForTests();
		database.rows.push({ requestId: "restart", billingId: "restart-bill", keyId: CAPPED, success: true, cost: 150, createdAt: Date.now() });
		expect(await dailyCost(target, CAPPED)).toBe(250);
		const internals = target as unknown as { reseed(key: string): Promise<void> };
		await internals.reseed(CAPPED);
		await internals.reseed(CAPPED);
		expect(await dailyCost(target, CAPPED)).toBe(150);
	});

	it("clears a protocol-1 over-count from a lost response once a seed covers it", async () => {
		const target = new OldCoordinator(sqliteState(sqlite), database);
		enforce(target);
		database.keys.set(CAPPED, { workspaceId: WORKSPACE, daily: [100, 1_000] });
		await checkSpendLimit({ workspaceId: WORKSPACE, keyId: CAPPED, admissionId: "lost" });
		const record = target.record.bind(target);
		let calls = 0;
		target.record = async (...args: Parameters<typeof record>) => {
			const result = await record(...args);
			if (++calls === 1) throw new Error("response lost");
			return result;
		};
		const args = { workspaceId: WORKSPACE, keyId: CAPPED, billingRequestId: "lost-bill", requestId: "lost" };
		recordCheckpointSpend({ ...args, costNanos: 100, revision: 1 });
		await flushSpendRecordsForTests();
		recordCheckpointSpend({ ...args, costNanos: 150, revision: 2 });
		await flushSpendRecordsForTests();
		recordSpend({ ...args, costNanos: 150, replace: true });
		await flushSpendRecordsForTests();
		database.rows.push({ requestId: "lost", billingId: "lost-bill", keyId: CAPPED, success: true, cost: 150, createdAt: Date.now() });
		const internals = target as unknown as { reseed(key: string): Promise<void> };
		await internals.reseed(CAPPED);
		await internals.reseed(CAPPED);
		expect(await dailyCost(target, CAPPED)).toBe(150);
	});

	it("clears a protocol-2 over-count from a lost response and a replay once a seed covers it", async () => {
		enforce(coordinator);
		database.keys.set(CAPPED, { workspaceId: WORKSPACE, daily: [100, 1_000] });
		await checkSpendLimit({ workspaceId: WORKSPACE, keyId: CAPPED, admissionId: "lost-v2" });
		const record = coordinator.record.bind(coordinator);
		let calls = 0;
		coordinator.record = async (...args: Parameters<typeof record>) => {
			const result = await record(...args);
			if (++calls === 1) throw new Error("response lost");
			return result;
		};
		const args = { workspaceId: WORKSPACE, keyId: CAPPED, billingRequestId: "lost-v2-bill", requestId: "lost-v2" };
		recordCheckpointSpend({ ...args, costNanos: 100, revision: 1 });
		await flushSpendRecordsForTests();
		recordCheckpointSpend({ ...args, costNanos: 100, revision: 1 });
		await flushSpendRecordsForTests();
		database.rows.push({ requestId: "lost-v2", billingId: "lost-v2-bill", keyId: CAPPED, success: true, cost: 150, createdAt: Date.now() });
		recordSpend({ ...args, costNanos: 150, replace: true });
		await flushSpendRecordsForTests();
		const internals = coordinator as unknown as { reseed(key: string): Promise<void> };
		await internals.reseed(CAPPED);
		await internals.reseed(CAPPED);
		expect(await dailyCost(coordinator, CAPPED)).toBe(150);
	});
});

describe("main's isolate with this coordinator", () => {
	beforeEach(() => {
		mainIsolate.__resetSpendLimitsForTests();
		enforce(coordinator);
	});

	it("counts its successes and frees its failures", async () => {
		database.keys.set(CAPPED, { workspaceId: WORKSPACE, daily: [2, 1_000_000] });
		const a = await mainIsolate.checkSpendLimit({ workspaceId: WORKSPACE, keyId: CAPPED, admissionId: "a" });
		const b = await mainIsolate.checkSpendLimit({ workspaceId: WORKSPACE, keyId: CAPPED, admissionId: "b" });
		if (a.outcome !== "allowed" || b.outcome !== "allowed") throw new Error("expected admissions");
		mainIsolate.recordSpend({ admission: a.admission, workspaceId: WORKSPACE, keyId: CAPPED, billingRequestId: "bill-a", requestId: "a", costNanos: 300 });
		mainIsolate.releaseSpend(b.admission);
		await mainIsolate.flushSpendRecordsForTests();
		await flush();
		expect((await probe(CAPPED))?.daily).toMatchObject({ requestsUsed: 1, costUsedNanos: 300 });
		const c = await mainIsolate.checkSpendLimit({ workspaceId: WORKSPACE, keyId: CAPPED, admissionId: "c" });
		expect(c.outcome).toBe("allowed");
	});
});
