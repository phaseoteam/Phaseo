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
