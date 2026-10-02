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
let env: GatewayBindings;
let getConfig: ReturnType<typeof vi.fn>;

function object() { return new CustomerRateLimitDurableObject(state, env); }

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-10-02T23:59:30Z"));
	db = new DatabaseSync(":memory:");
	state = {
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
	getConfig = vi.fn().mockResolvedValue(null);
	env = { GATEWAY_CACHE: { get: getConfig } } as unknown as GatewayBindings;
});

afterEach(() => { db.close(); vi.useRealTimers(); });

describe("customer quota coordinator", () => {
	it("admits only 25 concurrent requests and coalesces config reads", async () => {
		const limiter = object();
		const results = await Promise.all(Array.from({ length: 100 }, (_, index) => limiter.admit(key, "minute", String(index))));
		expect(results.filter(result => result.allowed)).toHaveLength(25);
		expect(results[25]).toEqual({ allowed: false, limit: 25, remaining: 0, retryAfterSeconds: 60 });
		expect(getConfig).toHaveBeenCalledTimes(1);
	});

	it("uses a rolling minute across the wall-clock minute boundary", async () => {
		const limiter = object();
		for (let index = 0; index < 25; index++) await limiter.admit(key, "minute", String(index));
		vi.advanceTimersByTime(30_000);
		expect(await limiter.admit(key, "minute", "next")).toMatchObject({ allowed: false, retryAfterSeconds: 30 });
		vi.advanceTimersByTime(30_000);
		expect(await limiter.admit(key, "minute", "next")).toMatchObject({ allowed: true, remaining: 24 });
	});

	it("counts one free admission through fallback and resets at midnight UTC", async () => {
		const limiter = object();
		for (let index = 0; index < 1500; index++) await limiter.admit(key, "free-day", String(index));
		expect(await limiter.admit(key, "free-day", "0")).toMatchObject({ allowed: true, remaining: 0 });
		expect(await limiter.admit(key, "free-day", "extra")).toMatchObject({ allowed: false, limit: 1500, retryAfterSeconds: 30 });
		vi.advanceTimersByTime(30_000);
		expect(await limiter.admit(key, "free-day", "extra")).toMatchObject({ allowed: true, remaining: 1499 });
	});

	it("retains counters across coordinator restarts", async () => {
		const first = object();
		for (let index = 0; index < 25; index++) await first.admit(key, "minute", String(index));
		expect(await object().admit(key, "minute", "extra")).toMatchObject({ allowed: false });
	});

	it("uses administrator overrides and refreshes them after one minute", async () => {
		getConfig.mockResolvedValue({ requestsPerMinute: 50, freeRequestsPerDay: 250 });
		const limiter = object();
		expect(await limiter.admit(key, "minute", "1")).toMatchObject({ limit: 50, remaining: 49 });
		expect(await limiter.admit(key, "free-day", "1")).toMatchObject({ limit: 250 });
		getConfig.mockResolvedValue({ requestsPerMinute: 75 });
		vi.advanceTimersByTime(60_000);
		expect(await limiter.admit(key, "minute", "2")).toMatchObject({ limit: 75 });
		expect(getConfig).toHaveBeenCalledTimes(2);
	});

	it("does not increment counters when config is invalid or unavailable", async () => {
		getConfig.mockResolvedValue({ requestsPerMinute: 0 });
		const limiter = object();
		await expect(limiter.admit(key, "minute", "1")).rejects.toThrow("invalid_customer_limits");
		getConfig.mockRejectedValue(new Error("KV unavailable"));
		await expect(limiter.admit(key, "minute", "1")).rejects.toThrow("KV unavailable");
		getConfig.mockResolvedValue(null);
		expect(await limiter.admit(key, "minute", "1")).toMatchObject({ remaining: 24 });
	});
});
