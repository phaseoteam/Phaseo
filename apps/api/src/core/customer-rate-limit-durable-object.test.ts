import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
	DurableObject: class {
		constructor(public ctx: DurableObjectState, public env: unknown) {}
	},
}));

import { CustomerRateLimitDurableObject } from "./customer-rate-limit-durable-object";
import type { GatewayBindings } from "@/runtime/env.types";

const key = "customer-quota:v1:workspace:user";
let db: DatabaseSync;
let state: DurableObjectState;
let sqlCalls: string[];

function object() { return new CustomerRateLimitDurableObject(state, {} as GatewayBindings); }

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-10-02T23:59:30Z"));
	db = new DatabaseSync(":memory:");
	sqlCalls = [];
	state = {
		blockConcurrencyWhile: (fn: () => Promise<unknown>) => fn(),
		storage: {
			sql: {
				exec: (query: string, ...args: Array<string | number>) => {
					sqlCalls.push(query);
					const statement = db.prepare(query);
					const rows = statement.columns().length ? statement.all(...args) : (statement.run(...args), []);
					return { toArray: () => rows, one: () => rows[0] };
				},
			},
		},
	} as unknown as DurableObjectState;
});

afterEach(() => { db.close(); vi.useRealTimers(); });

describe("customer quota coordinator", () => {
	it("admits exactly the default limit concurrently with one checkpoint write and no KV access", async () => {
		const limiter = object();
		sqlCalls = [];
		const results = await Promise.all(Array.from({ length: 100 }, (_, index) => limiter.admit(key, "minute", String(index))));
		expect(results.filter(result => result.allowed)).toHaveLength(25);
		expect(results[25]).toEqual({ allowed: false, limit: 25, remaining: 0, retryAfterSeconds: 60 });
		expect(sqlCalls).toEqual(["INSERT OR REPLACE INTO minute_checkpoint (id, entries) VALUES (1, ?)"]);
	});

	it("uses a rolling minute across the wall-clock minute boundary", async () => {
		const limiter = object();
		for (let index = 0; index < 25; index++) await limiter.admit(key, "minute", String(index));
		vi.advanceTimersByTime(30_000);
		expect(await limiter.admit(key, "minute", "next")).toMatchObject({ allowed: false, retryAfterSeconds: 30 });
		vi.advanceTimersByTime(30_000);
		expect(await limiter.admit(key, "minute", "next")).toMatchObject({ allowed: true, remaining: 24 });
	});

	it("keeps admission IDs idempotent and reports when the last slot is used", async () => {
		const limiter = object();
		const limits = { requestsPerMinute: 2 };
		expect(await limiter.admit(key, "minute", "a", limits)).toEqual({ allowed: true, limit: 2, remaining: 1, retryAfterSeconds: 0 });
		vi.advanceTimersByTime(10_000);
		expect(await limiter.admit(key, "minute", "b", limits)).toEqual({ allowed: true, limit: 2, remaining: 0, retryAfterSeconds: 50 });
		expect(await limiter.admit(key, "minute", "a", limits)).toMatchObject({ allowed: true, remaining: 0 });
		expect(await limiter.admit(key, "minute", "c", limits)).toMatchObject({ allowed: false, retryAfterSeconds: 50 });
	});

	it("counts one free admission through fallback and resets at midnight UTC", async () => {
		const limiter = object();
		for (let index = 0; index < 1499; index++) await limiter.admit(key, "free-day", String(index));
		expect(await limiter.admit(key, "free-day", "last")).toMatchObject({ allowed: true, remaining: 0, retryAfterSeconds: 30 });
		expect(await limiter.admit(key, "free-day", "0")).toMatchObject({ allowed: true, remaining: 0 });
		expect(await limiter.admit(key, "free-day", "extra")).toMatchObject({ allowed: false, limit: 1500, retryAfterSeconds: 30 });
		vi.advanceTimersByTime(30_000);
		expect(await limiter.admit(key, "free-day", "extra")).toMatchObject({ allowed: true, remaining: 1499 });
	});

	it("retains daily free counters exactly across restarts", async () => {
		const first = object();
		for (let index = 0; index < 3; index++) await first.admit(key, "free-day", String(index), { freeRequestsPerDay: 3 });
		const second = object();
		expect(await second.admit(key, "free-day", "extra", { freeRequestsPerDay: 3 })).toMatchObject({ allowed: false });
	});

	it("restores the checkpointed minute window after a restart, forgetting at most five seconds", async () => {
		const limits = { requestsPerMinute: 3 };
		const first = object();
		await first.admit(key, "minute", "a", limits);
		vi.advanceTimersByTime(1_000);
		await first.admit(key, "minute", "b", limits);
		// Restart before the next checkpoint: "a" survives, "b" is forgotten.
		const second = object();
		expect(await second.admit(key, "minute", "a", limits)).toMatchObject({ allowed: true, remaining: 2 });
		expect(await second.admit(key, "minute", "b", limits)).toMatchObject({ allowed: true, remaining: 1 });
		expect(await second.admit(key, "minute", "c", limits)).toMatchObject({ allowed: true, remaining: 0 });
		expect(await second.admit(key, "minute", "d", limits)).toMatchObject({ allowed: false });
		vi.advanceTimersByTime(60_000);
		const third = object();
		expect(await third.admit(key, "minute", "f", limits)).toMatchObject({ allowed: true, remaining: 2 });
	});

	it("drops the legacy persisted minute log", async () => {
		db.exec("CREATE TABLE minute_requests (admission_id TEXT PRIMARY KEY, started_at INTEGER NOT NULL)");
		object();
		expect(db.prepare("SELECT name FROM sqlite_master WHERE name='minute_requests'").get()).toBeUndefined();
	});

	it("applies caller-supplied limits immediately and ignores invalid ones", async () => {
		const limiter = object();
		expect(await limiter.admit(key, "minute", "1", { requestsPerMinute: 50, freeRequestsPerDay: 250 })).toMatchObject({ limit: 50, remaining: 49 });
		expect(await limiter.admit(key, "free-day", "1", { requestsPerMinute: 50, freeRequestsPerDay: 250 })).toMatchObject({ limit: 250 });
		expect(await limiter.admit(key, "minute", "2", { requestsPerMinute: 75 })).toMatchObject({ limit: 75, remaining: 73 });
		vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(await limiter.admit(key, "minute", "3", { requestsPerMinute: 0 })).toMatchObject({ limit: 25, remaining: 22 });
	});

	it("serves one scope per object", async () => {
		const limiter = object();
		await limiter.admit(key, "minute", "1");
		await expect(limiter.admit("customer-quota:v1:other:user", "minute", "2")).rejects.toThrow("customer_scope_mismatch");
	});
});
