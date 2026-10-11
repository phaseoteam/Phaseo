import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
	DurableObject: class {
		constructor(public ctx: DurableObjectState, public env: unknown) {}
	},
}));
vi.mock("@/runtime/env", () => ({
	getCache: () => ({ get: async () => null, put: async () => undefined }),
	getBindingsIfConfigured: () => null,
	dispatchBackground: () => undefined,
	getSupabaseAdmin: () => { throw new Error("unused"); },
	getBindings: () => ({}),
}));

import { ProviderRateLimitDurableObject } from "./provider-rate-limit-durable-object";
import { LeasePool, type LeaseTransport } from "./lease-pool";
import type { ProviderLeaseMeta, ProviderRateLimitAdmission, ProviderRateLimitConfig } from "./provider-rate-limits";

let db: DatabaseSync;
let coordinator: ProviderRateLimitDurableObject;
let background: Promise<unknown>[];

function createCoordinator(): ProviderRateLimitDurableObject {
	const state = {
		blockConcurrencyWhile: (fn: () => Promise<unknown>) => fn(),
		storage: {
			sql: {
				exec: (query: string, ...args: Array<string | number>) => {
					const statement = db.prepare(query);
					const rows = statement.columns().length ? statement.all(...args) : (statement.run(...args), []);
					return { toArray: () => rows, one: () => rows[0] };
				},
			},
		},
	} as unknown as DurableObjectState;
	return new ProviderRateLimitDurableObject(state, {} as never);
}

function config(overrides: Partial<ProviderRateLimitConfig> = {}): ProviderRateLimitConfig {
	return { providerId: "openai", requestsPerMinute: null, requestsPerDay: null, tokensPerMinute: null,
		tokensPerDay: null, headroomBps: 0, ...overrides };
}

type Calls = { acquire: Array<{ requests: number }>; returns: number };
function isolate(limits: ProviderRateLimitConfig, calls: Calls = { acquire: [], returns: 0 }, delayMs = 0) {
	const pool = new LeasePool<ProviderLeaseMeta, ProviderRateLimitAdmission>({ background: (promise) => { background.push(promise); } });
	let sequence = 0;
	const transport: LeaseTransport<ProviderLeaseMeta, ProviderRateLimitAdmission> = {
		acquire: async (need, want, returns) => {
			calls.acquire.push({ requests: need.requests });
			calls.returns += returns.length;
			if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
			return coordinator.acquireLease(limits, need, want, returns, `r-${Math.random()}-${sequence++}`);
		},
		returnLeases: async (returns) => { calls.returns += returns.length; await coordinator.returnLeases(returns); },
	};
	return { pool, transport, calls, admit: (units = 0, requests = 1) => pool.admit(`ticket-${sequence++}`, { requests, units }, transport) };
}

function counters() {
	return db.prepare("SELECT * FROM counters").all()[0] as Record<string, number> | undefined;
}

async function flush(): Promise<void> {
	while (background.length) await Promise.all(background.splice(0));
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-10-09T12:00:05Z"));
	db = new DatabaseSync(":memory:");
	coordinator = createCoordinator();
	background = [];
});

afterEach(() => { db.close(); vi.useRealTimers(); });

describe("provider rate-limit leases", () => {
	it("admits from the slice without awaiting and tops up in the background", async () => {
		const limits = config({ requestsPerMinute: 1_000 });
		const node = isolate(limits);
		const first = await node.admit();
		expect(first).toMatchObject({ allowed: true, ticket: { fromSlice: false } });
		const granted = node.pool.snapshot()[0].requests!;
		expect(granted).toBeGreaterThan(1);
		// The coordinator counts the whole grant immediately.
		expect(counters()?.minute_requests).toBe(granted);

		const synchronous = node.pool.tryAdmit("sync", { requests: 1, units: 0 });
		expect(synchronous?.fromSlice).toBe(true);
		for (let i = 2; i < granted; i++) expect((await node.admit()).allowed).toBe(true);
		const topUps = node.calls.acquire.filter((call) => call.requests === 0);
		expect(topUps).toHaveLength(1);
		await flush();
		expect(node.pool.snapshot()).toHaveLength(2);
		const awaited = node.calls.acquire.filter((call) => call.requests > 0).length;
		for (let i = 0; i < 3; i++) expect((await node.admit()).allowed).toBe(true);
		expect(node.calls.acquire.filter((call) => call.requests > 0)).toHaveLength(awaited);
	});

	it("projects use from reported lease progress, not from whole leases", async () => {
		// 12:00:05: 5 seconds into the minute.
		const limits = config({ requestsPerMinute: 1_000, requestsPerDay: 1_000_000 });
		const first = await coordinator.acquireLease(limits, { requests: 1, units: 0 }, { requests: 100, units: 0 }, [], "first");
		if (!first.ok) throw new Error("expected a lease");
		expect(first.lease.requests).toBeGreaterThan(1);
		// One request in 5 seconds, projected over the minute; the rest of the lease is not use.
		expect(first.lease.meta).toMatchObject({ projectedUse: 12 / 1_000, projectedUntil: Date.now() + 20_000 });

		vi.setSystemTime(new Date("2026-10-09T12:00:30Z"));
		const second = await coordinator.acquireLease(limits, { requests: 1, units: 0 }, { requests: 4, units: 0 }, [],
			"second", undefined, [{ id: first.lease.id, usedRequests: 61, usedUnits: 0 }]);
		if (!second.ok) throw new Error("expected a lease");
		// 62 used in 30 seconds: on course for 124.
		expect(second.lease.meta.projectedUse).toBeCloseTo(124 / 1_000);
	});

	it("lets reported token use fall when reservations are refunded", async () => {
		vi.setSystemTime(new Date("2026-10-09T12:00:30Z"));
		const limits = config({ tokensPerMinute: 100_000 });
		const lease = await coordinator.acquireLease(limits, { requests: 1, units: 5_000 }, { requests: 10, units: 50_000 }, [], "tokens");
		if (!lease.ok) throw new Error("expected a lease");
		const projected = async (usedUnits: number, id: string) => {
			const result = await coordinator.acquireLease(limits, { requests: 1, units: 1 }, { requests: 1, units: 1 }, [],
				id, undefined, [{ id: lease.lease.id, usedRequests: 1, usedUnits }]);
			if (!result.ok) throw new Error("expected a lease");
			return result.lease.meta.projectedUse!;
		};
		const reserved = await projected(5_000, "reserved");
		expect(await projected(500, "refunded")).toBeLessThan(reserved);
	});

	it("counts a returned lease's final use in the window it closes", async () => {
		const limits = config({ requestsPerMinute: 1_000 });
		const first = await coordinator.acquireLease(limits, { requests: 1, units: 0 }, { requests: 200, units: 0 }, [], "first");
		if (!first.ok) throw new Error("expected a lease");
		// The lease is returned with its final use by the first call of the next minute.
		vi.setSystemTime(new Date("2026-10-09T12:01:00Z"));
		const next = await coordinator.acquireLease(limits, { requests: 1, units: 0 }, { requests: 4, units: 0 },
			[{ id: first.lease.id, usedRequests: 80, usedUnits: 0, inFlightRequests: 0 }], "next");
		if (!next.ok) throw new Error("expected a lease");
		expect(next.lease.meta.projectedUse).toBeCloseTo(81 / 1_000, 3);
	});

	it("carries the previous minute's use into the next and shortens leases near the limit", async () => {
		const limits = config({ requestsPerMinute: 100 });
		const node = isolate(limits);
		for (let i = 0; i < 80; i++) { expect((await node.admit()).allowed).toBe(true); await flush(); }
		for (const lease of node.pool.drain()) await coordinator.returnLeases([lease]);

		// The next minute starts on course for the 80 the last one used.
		vi.setSystemTime(new Date("2026-10-09T12:01:00Z"));
		const next = await coordinator.acquireLease(limits, { requests: 1, units: 0 }, { requests: 20, units: 0 }, [], "next");
		if (!next.ok) throw new Error("expected a lease");
		expect(next.lease.meta.projectedUse).toBeCloseTo(0.8, 1);
		expect(next.lease.expiresAt - Date.now()).toBe(10_000);
	});

	it("acquires its own lease when another request's acquire never settles", async () => {
		const limits = config({ requestsPerMinute: 100 });
		const pool = new LeasePool<ProviderLeaseMeta, ProviderRateLimitAdmission>({ background: (promise) => { background.push(promise); } });
		let calls = 0;
		const transport: LeaseTransport<ProviderLeaseMeta, ProviderRateLimitAdmission> = {
			// The first acquire belongs to a request that ended; its I/O never settles.
			acquire: (need, want, returns) => ++calls === 1
				? new Promise(() => {})
				: coordinator.acquireLease(limits, need, want, returns, `r-${calls}`),
			returnLeases: async (returns) => { await coordinator.returnLeases(returns); },
		};
		void pool.admit("abandoned", { requests: 1, units: 0 }, transport);
		const admitted = pool.admit("waiting", { requests: 1, units: 0 }, transport);
		await vi.advanceTimersByTimeAsync(1_000);

		expect(await admitted).toMatchObject({ allowed: true });
		expect(calls).toBe(2);
	});

	it("awaits the coordinator near the cap and denies exactly at it", async () => {
		const limits = config({ requestsPerMinute: 10 });
		const node = isolate(limits);
		const results = [];
		for (let i = 0; i < 12; i++) { results.push(await node.admit()); await flush(); }
		expect(results.filter((result) => result.allowed)).toHaveLength(10);
		expect(results[10]).toMatchObject({ allowed: false, denial: { reason: "requests_per_minute", retryAfterSeconds: 55 } });
		// The reserve floor is never leased in bulk: the last admissions each awaited the object.
		const lastAllowed = results.slice(8, 10) as Array<{ ticket: { fromSlice: boolean } }>;
		expect(lastAllowed.every((result) => result.ticket.fromSlice === false)).toBe(true);
		expect(counters()?.minute_requests).toBe(10);
	});

	it("never exceeds request or token caps across concurrently admitting isolates", async () => {
		vi.useRealTimers();
		const limits = config({ requestsPerMinute: 200, tokensPerMinute: 50_000, headroomBps: 1_000 });
		const isolates = Array.from({ length: 6 }, () => isolate(limits, undefined, 1));
		let allowedRequests = 0, allowedTokens = 0, denied = 0;
		const pending: Promise<void>[] = [];
		for (let i = 0; i < 600; i++) {
			const node = isolates[i % isolates.length];
			const tokens = 50 + ((i * 37) % 400);
			pending.push(node.admit(tokens).then((result) => {
				if (result.allowed) { allowedRequests++; allowedTokens += tokens; } else denied++;
			}));
			if (i % 25 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
		}
		await Promise.all(pending);
		await flush();
		expect(denied).toBeGreaterThan(0);
		expect(allowedRequests).toBeLessThanOrEqual(200);
		expect(allowedTokens).toBeLessThanOrEqual(45_000);
		const row = counters()!;
		expect(row.minute_requests).toBeLessThanOrEqual(200);
		expect(row.minute_tokens).toBeLessThanOrEqual(45_000);
		// Everything admitted is counted, plus allowance still held in unexpired slices.
		expect(row.minute_requests).toBeGreaterThanOrEqual(allowedRequests);
		expect(row.minute_tokens).toBeGreaterThanOrEqual(allowedTokens);
		// Returning every slice leaves exactly the admitted usage.
		for (const node of isolates) await coordinator.returnLeases(node.pool.drain());
		expect(counters()?.minute_requests).toBe(allowedRequests);
		expect(counters()?.minute_tokens).toBe(allowedTokens);
	});

	it("returns unused allowance when a slice expires", async () => {
		const limits = config({ requestsPerDay: 10_000 });
		const node = isolate(limits);
		await node.admit();
		const granted = node.pool.snapshot()[0];
		expect(granted.expiresAt).toBe(Date.now() + 60_000);
		expect(counters()?.day_requests).toBe(granted.requests);
		vi.advanceTimersByTime(60_001);
		await node.admit();
		await flush();
		// The expired lease reported one used request; its unused part was refunded.
		const leases = node.pool.snapshot();
		expect(counters()?.day_requests).toBe(1 + leases.reduce((sum, lease) => sum + (lease.requests ?? 0), 0));
		expect(node.calls.returns).toBe(1);
		// A repeated return is ignored.
		await coordinator.returnLeases([{ id: granted.id, usedRequests: 0, usedUnits: 0, inFlightRequests: 0 }]);
		expect(counters()?.day_requests).toBe(1 + leases.reduce((sum, lease) => sum + (lease.requests ?? 0), 0));
	});

	it("ends minute-window leases before the window boundary", async () => {
		vi.setSystemTime(new Date("2026-10-09T12:00:50Z"));
		const node = isolate(config({ requestsPerMinute: 1_000 }));
		await node.admit();
		expect(node.pool.snapshot()[0].expiresAt).toBe(Date.parse("2026-10-09T12:01:00Z") - 2_000);
		vi.setSystemTime(new Date("2026-10-09T12:00:58.500Z"));
		// Too close to the boundary for a lease: the request is admitted alone.
		const late = isolate(config({ requestsPerMinute: 1_000 }));
		const result = await late.admit();
		expect(result).toMatchObject({ allowed: true, ticket: { fromSlice: false } });
		expect(late.pool.snapshot()).toHaveLength(0);
	});

	it("refunds settled tokens into the held slice and reconciles exactly once", async () => {
		const limits = config({ tokensPerMinute: 100_000 });
		const node = isolate(limits);
		const result = await node.admit(1_000);
		if (!result.allowed) throw new Error("expected admission");
		const ticket = result.ticket;
		const before = node.pool.snapshot()[0].usedUnits;
		expect(node.pool.settle(ticket, { requests: 0, units: -600 })).toBe(true);
		expect(node.pool.settle(ticket, { requests: 0, units: -600 })).toBe(true);
		expect(node.pool.snapshot()[0].usedUnits).toBe(before - 600);

		const reservation = { id: "reservation-x", providerId: "openai", tokens: 500, minuteWindow: ticket.meta.minuteWindow, dayWindow: ticket.meta.dayWindow };
		const tokens = counters()!.minute_tokens;
		await coordinator.reconcileTokens(reservation, 200);
		await coordinator.reconcileTokens(reservation, 200);
		expect(counters()?.minute_tokens).toBe(tokens - 300);
	});

	it("keeps serving legacy admissions from older gateway versions", async () => {
		const limits = config({ requestsPerMinute: 2 });
		expect((await coordinator.admit(limits, null, "a")).allowed).toBe(true);
		expect((await coordinator.admit(limits, null, "b")).allowed).toBe(true);
		expect((await coordinator.admit(limits, null, "c")).allowed).toBe(false);
	});
});
