import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	store: new Map<string, string>(),
	puts: [] as string[],
	deletes: [] as string[],
	gets: [] as string[],
	failPut: null as ((key: string) => boolean) | null,
	rows: [] as Array<Record<string, unknown>>,
	rpc: vi.fn(),
	background: [] as Promise<unknown>[],
}));

vi.mock("@/runtime/env", () => {
	const kv = {
		get: async (key: string) => { mocks.gets.push(key); return mocks.store.get(key) ?? null; },
		put: async (key: string, value: string) => {
			if (mocks.failPut?.(key)) throw new Error("kv write failed");
			mocks.puts.push(key);
			mocks.store.set(key, value);
		},
		delete: async (key: string) => { mocks.deletes.push(key); mocks.store.delete(key); },
	};
	return {
		getCache: () => kv,
		getSupabaseAdmin: () => ({ rpc: mocks.rpc }),
		getBindingsIfConfigured: () => ({}),
		dispatchBackground: (promise: Promise<unknown>) => { mocks.background.push(promise); },
	};
});

import { __resetTieredCacheForTests } from "./tiered-cache";
import {
	customerTierManifestKey, KV_OPERATIONS_PER_INVOCATION, MAX_TIER_WRITES_PER_RUN, publishCustomerRateLimitTiers, readCustomerLimits,
	TIER_MANIFEST_SHARD_COUNT,
} from "./customer-rate-limit-tiers";

const now = Date.parse("2026-10-09T12:00:00Z");
const daysAgo = (days: number) => new Date(now - days * 86_400_000).toISOString();
const id = (n: number) => `${(n % 16).toString(16)}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function row(n: number, overrides: Record<string, unknown> = {}) {
	return {
		workspace_id: id(n), created_at: daysAgo(10), billing_mode: "wallet", has_paid_top_up: false,
		lifetime_paid_spend_nanos: "0", override_requests_per_minute: null, override_free_requests_per_day: null,
		override_expires_at: null, ...overrides,
	};
}
const tierKeys = () => mocks.puts.filter(key => key.startsWith("customer-quota:v2:"));
const published = (n: number) => JSON.parse(mocks.store.get(`customer-quota:v2:${id(n)}`) ?? "null")?.v;
const publish = (options: { maxWrites?: number } = {}) => publishCustomerRateLimitTiers({ ladderRaw: undefined, now, ...options });

beforeEach(() => {
	vi.useRealTimers();
	__resetTieredCacheForTests();
	mocks.store.clear();
	mocks.puts.length = mocks.deletes.length = mocks.gets.length = mocks.background.length = 0;
	mocks.failPut = null;
	mocks.rows = [];
	mocks.rpc.mockReset().mockImplementation(async (_name: string, args: { p_after: string | null; p_limit: number }) => {
		const sorted = [...mocks.rows].sort((a, b) => String(a.workspace_id).localeCompare(String(b.workspace_id)));
		const page = sorted.filter(item => args.p_after === null || String(item.workspace_id) > args.p_after).slice(0, args.p_limit);
		return { data: page, error: null };
	});
});

describe("customer rate-limit tier publisher", () => {
	it("publishes each workspace's tier once and rewrites only changes", async () => {
		mocks.rows = [
			row(1), row(2, { created_at: daysAgo(1) }), row(3, { billing_mode: "invoice" }),
			row(4, { created_at: daysAgo(45), lifetime_paid_spend_nanos: "60000000000" }),
		];
		const first = await publish();
		expect(first).toMatchObject({ workspaces: 4, written: 3, unchanged: 1, deferred: 0, complete: true });
		expect(first.tiers).toEqual({ standard: 1, new: 1, enterprise: 1, trusted: 1 });
		expect(published(1)).toEqual({ tier: "standard" });
		expect(published(2)).toBeUndefined(); // The plain new tier is the meaning of a missing key.
		expect(published(3)).toEqual({ tier: "enterprise" });
		expect(published(4)).toEqual({ tier: "trusted" });
		expect(mocks.rpc).toHaveBeenCalledWith("gateway_customer_rate_limit_inputs", { p_after: null, p_limit: 1000 });

		mocks.puts.length = 0;
		const second = await publish();
		expect(second).toMatchObject({ written: 0, unchanged: 4, complete: true });
		expect(mocks.puts).toEqual([]);
		expect(mocks.gets.filter(key => key.includes("manifest"))).toHaveLength(32);

		mocks.rows[1] = row(2, { created_at: daysAgo(1), has_paid_top_up: true });
		const third = await publish();
		expect(third).toMatchObject({ written: 1, unchanged: 3 });
		expect(tierKeys()).toEqual([`customer-quota:v2:${id(2)}`]);
	});

	it("publishes overrides with their expiry and removes them once expired", async () => {
		const expiresAt = new Date(now + 3_600_000).toISOString();
		mocks.rows = [row(5, { created_at: daysAgo(1), override_requests_per_minute: 400, override_expires_at: expiresAt })];
		expect((await publish()).tiers).toEqual({ override: 1 });
		expect(published(5)).toEqual({ tier: "new", override: { requestsPerMinute: 400, expiresAt: now + 3_600_000 } });
		mocks.rows = [row(5, { created_at: daysAgo(1), override_requests_per_minute: 400, override_expires_at: daysAgo(1) })];
		expect(await publish()).toMatchObject({ deleted: 1 });
		expect(published(5)).toBeUndefined();
	});

	it("keeps a default run well inside the per-invocation KV operation limit", async () => {
		mocks.rows = Array.from({ length: 2500 }, (_, n) => row(n));
		mocks.gets.length = 0;
		mocks.puts.length = 0;
		mocks.deletes.length = 0;
		const summary = await publish();
		expect(summary).toMatchObject({ written: MAX_TIER_WRITES_PER_RUN, complete: false });
		const operations = mocks.gets.length + mocks.puts.length + mocks.deletes.length;
		expect(operations).toBeLessThanOrEqual(MAX_TIER_WRITES_PER_RUN + 2 * TIER_MANIFEST_SHARD_COUNT);
		// Leave at least half the invocation's KV operations to the other scheduled jobs.
		expect(operations).toBeLessThanOrEqual(KV_OPERATIONS_PER_INVOCATION / 2);
	});

	it("pages through every workspace and resumes a capped backfill on the next run", async () => {
		mocks.rows = Array.from({ length: 2500 }, (_, n) => row(n));
		const first = await publish({ maxWrites: 1000 });
		expect(first).toMatchObject({ workspaces: 2500, written: 1000, deferred: 1500, complete: false });
		expect(mocks.rpc).toHaveBeenCalledTimes(3);
		const second = await publish({ maxWrites: 1000 });
		expect(second).toMatchObject({ written: 1000, unchanged: 1000, deferred: 500 });
		const third = await publish({ maxWrites: 1000 });
		expect(third).toMatchObject({ written: 500, unchanged: 2000, deferred: 0, complete: true });
		expect(tierKeys()).toHaveLength(2500);
	});

	it("retries failed writes and keeps recorded progress when a later page fails", async () => {
		mocks.rows = [row(1), row(2)];
		mocks.failPut = key => key === `customer-quota:v2:${id(2)}`;
		expect(await publish()).toMatchObject({ written: 1, failed: 1, complete: false });
		mocks.failPut = null;
		mocks.puts.length = 0;
		expect(await publish()).toMatchObject({ written: 1, unchanged: 1, complete: true });
		expect(tierKeys()).toEqual([`customer-quota:v2:${id(2)}`]);

		mocks.rows = Array.from({ length: 1001 }, (_, n) => row(n + 10));
		mocks.rpc.mockImplementationOnce(async () => ({ data: [...mocks.rows].sort((a, b) =>
			String(a.workspace_id).localeCompare(String(b.workspace_id))).slice(0, 1000), error: null }))
			.mockImplementationOnce(async () => ({ data: null, error: { message: "db down" } }));
		await expect(publish({ maxWrites: 5000 })).rejects.toThrow("db down");
		// Workspaces 1 and 2 were not seen, but deletions wait for a complete scan.
		expect(published(1)).toEqual({ tier: "standard" });
		mocks.puts.length = 0;
		expect(await publish({ maxWrites: 5000 })).toMatchObject({ written: 1, unchanged: 1000, deleted: 2, complete: true });
	});

	it("deletes keys for workspaces that no longer exist", async () => {
		mocks.rows = [row(1), row(2)];
		await publish();
		mocks.rows = [row(1)];
		expect(await publish()).toMatchObject({ deleted: 1, unchanged: 1 });
		expect(mocks.deletes).toEqual([`customer-quota:v2:${id(2)}`]);
		const manifest = JSON.parse(mocks.store.get(customerTierManifestKey(id(2)[0]))!);
		expect(manifest.w).toEqual({});
	});

	it("refuses to publish with invalid tuning rather than misclassifying", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		mocks.rows = [row(1)];
		await expect(publishCustomerRateLimitTiers({ ladderRaw: "{bad", now })).rejects.toThrow("invalid_customer_rate_limit_ladder");
		expect(mocks.puts).toEqual([]);
	});
});

describe("request-path tier lookup", () => {
	it("resolves published tiers from KV, caching them in the isolate", async () => {
		mocks.rows = [row(1, { billing_mode: "invoice" })];
		await publish();
		__resetTieredCacheForTests();
		mocks.gets.length = 0;
		expect(await readCustomerLimits(id(1), undefined)).toEqual({ tier: "enterprise", requestsPerMinute: 120, freeRequestsPerDay: 1500 });
		expect(await readCustomerLimits(id(1), undefined)).toMatchObject({ tier: "enterprise" });
		expect(mocks.gets).toEqual([`customer-quota:v2:${id(1)}`]);
	});

	it("treats a missing key as the new tier without writing it back", async () => {
		expect(await readCustomerLimits(id(9), undefined)).toEqual({ tier: "new", requestsPerMinute: 10, freeRequestsPerDay: 1500 });
		await Promise.all(mocks.background);
		expect(mocks.puts).toEqual([]);
	});

	it("applies an unexpired override and the configured ladder", async () => {
		mocks.store.set(`customer-quota:v2:${id(7)}`, JSON.stringify({ v: { tier: "standard", override: { freeRequestsPerDay: 9000 } }, at: now }));
		mocks.store.set(`customer-quota:v2:${id(8)}`, JSON.stringify({ v: { tier: "bogus" }, at: now }));
		expect(await readCustomerLimits(id(7), "{\"tiers\":{\"standard\":{\"requestsPerMinute\":30}}}"))
			.toEqual({ tier: "standard", requestsPerMinute: 30, freeRequestsPerDay: 9000 });
		expect(await readCustomerLimits(id(8), undefined)).toMatchObject({ tier: "new" });
	});
});
