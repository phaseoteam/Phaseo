import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
	DurableObject: class {
		constructor(public ctx: DurableObjectState, public env: unknown) {}
	},
}));

import { HEALTH_URGENT_PUBLISH_GAP_MS, RoutingHealthDurableObject } from "./routing-health-durable-object";
import { HEALTH_PUBLISH_INTERVAL_MS, healthSnapshotKey, type HealthObservation, type HealthSnapshot } from "@pipeline/execute/health-evidence";
import type { GatewayBindings } from "@/runtime/env.types";

let db: DatabaseSync;
let alarm: number | null;
let sqlCalls: string[];
let storageCalls: string[];
let put: ReturnType<typeof vi.fn>;
let state: DurableObjectState;
let env: GatewayBindings;
let sequence = 0;
let initialising: Promise<unknown>;

function object() {
	return new RoutingHealthDurableObject(state, env);
}

async function ready(health: RoutingHealthDurableObject) {
	await initialising;
	return health;
}

function event(overrides: Partial<HealthObservation> = {}): HealthObservation {
	const now = Date.now();
	return {
		id: `report-${++sequence}`, endpoint: "text.generate", model: "lab/model", provider: "alpha",
		observedAt: now, startedAt: now - 100, ok: true, limited: false, latencyMs: 100, tps: null, probe: false,
		...overrides,
	};
}

function published(): HealthSnapshot {
	return JSON.parse(put.mock.calls.at(-1)![1]) as HealthSnapshot;
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
	db = new DatabaseSync(":memory:");
	alarm = null;
	sqlCalls = [];
	storageCalls = [];
	put = vi.fn().mockResolvedValue(undefined);
	state = {
		blockConcurrencyWhile: (fn: () => Promise<unknown>) => (initialising = fn()),
		storage: {
			getAlarm: async () => { storageCalls.push("getAlarm"); return alarm; },
			setAlarm: async (at: number) => { storageCalls.push("setAlarm"); alarm = at; },
			transactionSync: (fn: () => unknown) => {
				db.exec("BEGIN");
				try { const result = fn(); db.exec("COMMIT"); return result; } catch (error) { db.exec("ROLLBACK"); throw error; }
			},
			sql: {
				exec: (query: string, ...args: Array<string | number>) => {
					sqlCalls.push(query);
					if (!args.length && query.includes(";")) { db.exec(query); return { toArray: () => [], one: () => undefined }; }
					const statement = db.prepare(query);
					const rows = statement.columns().length ? statement.all(...args) : (statement.run(...args), []);
					return { toArray: () => rows, one: () => rows[0] };
				},
			},
		},
	} as unknown as DurableObjectState;
	env = { GATEWAY_CACHE: { put } } as unknown as GatewayBindings;
});

afterEach(() => { db.close(); vi.useRealTimers(); });

describe("routing health coordinator", () => {
	it("observes without storage reads or writes after construction, arming one alarm", async () => {
		const health = await ready(object());
		sqlCalls = [];
		storageCalls = [];
		for (let index = 0; index < 50; index++) await health.observe(event());
		expect(sqlCalls).toEqual([]);
		expect(storageCalls).toEqual(["setAlarm"]);
		expect(alarm).toBe(Date.now() + HEALTH_PUBLISH_INTERVAL_MS);
	});

	it("deduplicates retried reports in memory and returns the current receipt", async () => {
		const health = await ready(object());
		const report = event();
		const first = await health.observe(report);
		const retry = await health.observe(report);
		expect(retry).toEqual(first);
		expect(first?.health.observations).toBe(1);
	});

	it("publishes and persists only at the alarm, keeping the snapshot format", async () => {
		const health = await ready(object());
		await health.observe(event());
		await health.observe(event({ provider: "beta" }));
		expect(db.prepare("SELECT count(*) AS count FROM providers").get()).toEqual({ count: 0 });
		vi.setSystemTime(alarm!);
		await health.alarm();
		expect(put).toHaveBeenCalledTimes(1);
		expect(put.mock.calls[0][0]).toBe(healthSnapshotKey("text.generate", "lab/model"));
		const snapshot = published();
		expect(snapshot.version).toBe(2);
		expect(snapshot.publishedAt).toBe(Date.now());
		expect(Object.keys(snapshot.providers).sort()).toEqual(["alpha", "beta"]);
		expect(db.prepare("SELECT count(*) AS count FROM providers").get()).toEqual({ count: 2 });
		expect(db.prepare("SELECT version, published FROM metadata").get()).toEqual({ version: 2, published: 2 });
		// Nothing new: the alarm is not re-armed and nothing is rewritten.
		alarm = null;
		await health.alarm();
		expect(put).toHaveBeenCalledTimes(1);
		expect(alarm).toBeNull();
	});

	it("restores evidence and versions after eviction so published versions never regress", async () => {
		const first = await ready(object());
		await first.observe(event());
		vi.setSystemTime(alarm!);
		await first.alarm();
		await first.observe(event()); // Lost with the instance: never persisted.
		const second = await ready(object());
		const receipt = await second.observe(event());
		expect(receipt?.health.observations).toBe(2);
		expect(receipt?.version).toBe(2);
		vi.setSystemTime(Date.now() + HEALTH_PUBLISH_INTERVAL_MS);
		await second.alarm();
		expect(published().version).toBe(2);
		expect(published().providers.alpha.observations).toBe(2);
	});

	it("publishes promptly when a breaker changes state, at most once per second", async () => {
		const health = await ready(object());
		await health.observe(event());
		vi.setSystemTime(alarm!);
		await health.alarm();
		const publishedAt = Date.now();
		vi.advanceTimersByTime(200);
		let receipt;
		for (let index = 0; index < 8; index++) receipt = await health.observe(event({ ok: false }));
		expect(receipt?.health.breaker).toBe("open");
		expect(alarm).toBe(publishedAt + Math.max(HEALTH_URGENT_PUBLISH_GAP_MS, 200));
		vi.setSystemTime(alarm!);
		await health.alarm();
		expect(put).toHaveBeenCalledTimes(2);
		expect(published().providers.alpha.breaker).toBe("open");
		// Ordinary evidence after the urgent publication waits for the interval.
		await health.observe(event({ ok: false }));
		expect(alarm).toBe(Date.now() + HEALTH_PUBLISH_INTERVAL_MS);
	});

	it("keeps unpublished state and retries when KV publication fails", async () => {
		const health = await ready(object());
		await health.observe(event());
		put.mockRejectedValueOnce(new Error("kv down"));
		vi.setSystemTime(alarm!);
		await expect(health.alarm()).rejects.toThrow("kv down");
		expect(alarm).toBe(Date.now() + HEALTH_PUBLISH_INTERVAL_MS);
		expect(db.prepare("SELECT version, published FROM metadata").get()).toEqual({ version: 1, published: 0 });
		vi.setSystemTime(alarm!);
		await health.alarm();
		expect(published().version).toBe(1);
	});

	it("rejects stale reports and mismatched pools", async () => {
		const health = await ready(object());
		expect(await health.observe(event({ observedAt: Date.now() - 200_000, startedAt: Date.now() - 200_100 }))).toBeNull();
		await health.observe(event());
		await expect(health.observe(event({ model: "other" }))).rejects.toThrow("Health pool mismatch");
	});

	it("adopts and drops legacy deduplication rows", async () => {
		db.exec("CREATE TABLE reports (id TEXT PRIMARY KEY, received INTEGER NOT NULL) WITHOUT ROWID");
		db.prepare("INSERT INTO reports VALUES (?, ?)").run("legacy", Date.now() - 1000);
		const health = await ready(object());
		expect(db.prepare("SELECT name FROM sqlite_master WHERE name='reports'").get()).toBeUndefined();
		expect(await health.observe(event({ id: "legacy" }))).toBeNull();
	});
});
