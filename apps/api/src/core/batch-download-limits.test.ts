import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ DurableObject: class {
	ctx: unknown;
	constructor(ctx: unknown) { this.ctx = ctx; }
} }));
const bindings = vi.hoisted(() => ({ getByName: vi.fn((_name: string) => ({ admitBatchDownload: async () => ({ allowed: true, retryAfterSeconds: 0 }) })) }));
vi.mock("@/runtime/env", () => ({ getBindings: () => ({ PROVIDER_RATE_LIMITS: bindings }) }));
import { ProviderRateLimitDurableObject } from "./provider-rate-limit-durable-object";
import { admitBatchDownload } from "./batch-download-limits";

afterEach(() => vi.useRealTimers());

it("scopes admission by workspace and batch without including API keys", async () => {
	await admitBatchDownload("ws1", "batch1");
	await admitBatchDownload("ws1", "batch1");
	await admitBatchDownload("ws2", "batch1");
	await admitBatchDownload("ws1", "batch2");
	const names = bindings.getByName.mock.calls.map((args) => args[0]);
	expect(names[0]).toBe(names[1]);
	expect(new Set(names).size).toBe(3);
});

it("atomically admits ten downloads in a rolling window and persists across instances", async () => {
	vi.useFakeTimers(); vi.setSystemTime(0);
	const db = new DatabaseSync(":memory:");
	const ctx = { blockConcurrencyWhile: (fn: () => unknown) => fn(), storage: {
		setAlarm: vi.fn(async (_time: number) => {}),
		deleteAll: vi.fn(async () => { db.exec("DROP TABLE batch_downloads; DROP TABLE counters"); }),
		sql: {
		exec: (query: string, ...args: any[]) => {
			const rows = db.prepare(query).all(...args);
			return { toArray: () => rows };
		},
	} } };
	const make = () => new ProviderRateLimitDurableObject(ctx as any, {} as any);
	try {
		const object = make();
		const admissions = await Promise.all(Array.from({ length: 11 }, () => object.admitBatchDownload()));
		expect(admissions.filter((a) => a.allowed)).toHaveLength(10);
		expect(admissions[10]).toEqual({ allowed: false, retryAfterSeconds: 1800 });
		vi.setSystemTime(1_799_001);
		expect(await make().admitBatchDownload()).toEqual({ allowed: false, retryAfterSeconds: 1 });
		vi.setSystemTime(1_800_000);
		expect((await make().admitBatchDownload()).allowed).toBe(true);
		await object.alarm();
		expect(ctx.storage.deleteAll).not.toHaveBeenCalled();
		expect(ctx.storage.setAlarm).toHaveBeenLastCalledWith(3_600_000);
		vi.setSystemTime(3_600_000);
		await object.alarm();
		expect(ctx.storage.deleteAll).toHaveBeenCalledOnce();
		expect((await make().admitBatchDownload()).allowed).toBe(true);
	} finally { db.close(); }
});
