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
			.toEqual({ duplicates: 1, drainKeyIds: [], protocol: 2 });
		const next = await checkSpendLimit({ workspaceId: WORKSPACE, keyId: KEY, admissionId: "req-2" });
		expect(next.keyLimit?.buckets?.daily).toMatchObject({ requestsUsed: 1, costUsedNanos: 250 });
	});

	it("keeps the latest checkpoint and the final settlement of a stepped charge, in any delivery order", async () => {
		const used = async () => (await probe())?.daily;
		const entry = { keyId: KEY, billingRequestId: "bill-stepped", requestId: "req-stepped", requests: 1, replace: true };
		await checkSpendLimit({ workspaceId: WORKSPACE, keyId: KEY, admissionId: "warm" });
		// Checkpoints report the charged total so far; the drain may be stopped before it settles. They
		// settle cost only: the request is still in flight (its lease holds it), not yet a success.
		await coordinator.record(WORKSPACE, { ...entry, costNanos: 100, revision: 1 });
		expect(await used()).toMatchObject({ requestsUsed: 0, costUsedNanos: 100 });
		await coordinator.record(WORKSPACE, { ...entry, costNanos: 250, revision: 2 });
		expect(await used()).toMatchObject({ requestsUsed: 0, costUsedNanos: 250 });
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
